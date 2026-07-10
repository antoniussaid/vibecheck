import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseReport, type IssueGroup, type ViewportName } from '@vibecheck/report-schema';
import { scan } from './scanner.js';
import { serveDirectory, type StaticServer } from './static-server.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const fixtureDist = resolve(repoRoot, 'apps/demo-fixture/dist');
const tmpRoot = resolve(repoRoot, '.tmp-test');

let server: StaticServer;
let outputRoot: string;
let fixtureBundle = '';

/** Concatenate the built fixture's JS bundle(s) so we can inspect build mode. */
function readFixtureBundle(): string {
  const assets = join(fixtureDist, 'assets');
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
}

/** Keep only the events a given viewport produced. */
function on<T extends { viewport: ViewportName }>(items: T[], viewport: ViewportName): T[] {
  return items.filter((item) => item.viewport === viewport);
}

beforeAll(async () => {
  // Always build the demo fixture as a PRODUCTION bundle, explicitly forcing
  // NODE_ENV=production. Vitest runs with NODE_ENV=test, which would otherwise
  // make @vitejs/plugin-react emit a React *development* bundle (jsxDEV +
  // StrictMode double-invoked effects), doubling the seeded raw event counts
  // (e.g. 6 console errors per viewport instead of 3). Forcing production yields
  // the exact same bundle the real demo scan uses, and we never reuse a
  // possibly-dev dist left behind by an earlier run.
  execSync('npm run build -w @vibecheck/demo-fixture', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  fixtureBundle = readFixtureBundle();
  server = await serveDirectory(fixtureDist);
  await mkdir(tmpRoot, { recursive: true });
  // Keep test output inside the project (git-ignored), never in the OS temp dir.
  outputRoot = await mkdtemp(join(tmpRoot, 'it-'));
}, 180_000);

afterAll(async () => {
  await server?.close();
  if (outputRoot) {
    await rm(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => {},
    );
  }
});

describe('scanner integration against the demo fixture', () => {
  it('serves a production fixture build (no React dev double-effects)', () => {
    // A production bundle has no jsxDEV dev runtime and embeds no absolute
    // source paths. This guarantees the exact per-viewport counts below run
    // against a production fixture, not a StrictMode-doubled development build.
    expect(fixtureBundle).not.toContain('jsxDEV');
    expect(fixtureBundle).not.toContain('/src/App');
  });

  it('captures the exact deliberately seeded defects with real browser evidence', async () => {
    // Generous (but bounded) per-viewport navigation timeout and settle window so
    // a cold or load-stressed runner reliably renders all three viewports and
    // captures every seeded async event (the setTimeout page error and the two
    // fetches). Defaults stay unchanged for production scans.
    const { report, reportDir } = await scan({
      url: server.url,
      outputRoot,
      navigationTimeoutMs: 60_000,
      settleMs: 1_500,
    });

    // All three viewports are always attempted, in a fixed order.
    expect(report.viewportResults.map((r) => r.viewport.name)).toEqual([
      'desktop',
      'tablet',
      'mobile',
    ]);

    const rendered = report.viewportResults.filter((r) => r.ok);
    const stalled = report.viewportResults.filter((r) => !r.ok);
    const renderedNames = rendered.map((r) => r.viewport.name);

    // A heavily loaded machine can stall a viewport (navigation or screenshot
    // timeout). The scanner then reports an honest `partial` scan — that is
    // product behaviour, not a scanner defect. So the per-viewport contract
    // below is asserted for the viewports that actually rendered, rather than
    // pinning global totals to the machine's speed. A stall is never silent.
    if (stalled.length > 0) {
      console.warn(
        `[integration] ${stalled.length} viewport(s) did not render: ` +
          stalled.map((r) => `${r.viewport.name} (${r.error ?? 'unknown error'})`).join(', '),
      );
    }
    expect(renderedNames.length).toBeGreaterThan(0);

    // Every rendered viewport produced a real, non-empty screenshot file.
    for (const name of renderedNames) {
      const shot = report.screenshots.find((s) => s.viewport === name);
      if (!shot) throw new Error(`no screenshot recorded for ${name}`);
      const info = await stat(join(reportDir, shot.path));
      expect(info.isFile()).toBe(true);
      expect(info.size).toBeGreaterThan(0);
    }

    // DEFECT 2: the exact deliberate console.error message.
    expect(
      report.consoleMessages.some(
        (m) => m.level === 'error' && m.message.includes('simulated runtime error'),
      ),
    ).toBe(true);

    // DEFECT 6: the exact deliberate uncaught page error.
    expect(report.pageErrors.some((e) => e.message.includes('simulated uncaught error'))).toBe(
      true,
    );

    // DEFECT 3a: the 404 to /api/products as an HTTP error.
    expect(
      report.httpErrors.some((e) => e.requestUrl.includes('/api/products') && e.status === 404),
    ).toBe(true);

    // DEFECT 3b: the network-level failed request to the dead endpoint.
    expect(report.failedRequests.some((e) => e.requestUrl.includes('/__vibecheck/dead'))).toBe(
      true,
    );

    // DEFECTS 4 & 5: the exact axe rule ids (label + image-alt), and no spurious
    // region. Accessibility is analysed once, on a viewport that rendered.
    const ruleIds = report.accessibilityFindings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(['image-alt', 'label']);
    expect(report.accessibilityFindings.every((f) => renderedNames.includes(f.viewport))).toBe(
      true,
    );

    // The demo only loads loopback resources: no security blocks.
    expect(report.securityFindings).toHaveLength(0);

    // The counting contract: on a production build each seeded defect is observed
    // exactly once per rendered viewport. A React development bundle (StrictMode
    // double-invoked effects) or a duplicated event listener doubles these — that
    // is the regression this guards, and it holds however many viewports render.
    const consoleErrors = report.consoleMessages.filter((m) => m.level === 'error');
    for (const name of renderedNames) {
      expect(on(consoleErrors, name)).toHaveLength(3);
      expect(on(report.pageErrors, name)).toHaveLength(1);
      expect(on(report.failedRequests, name)).toHaveLength(1);
      expect(on(report.httpErrors, name)).toHaveLength(1);
    }

    // The same three console errors on every viewport — not three different ones.
    const renderedConsole = consoleErrors.filter((m) => renderedNames.includes(m.viewport));
    expect(new Set(renderedConsole.map((m) => m.message)).size).toBe(3);

    // Grouping collapses viewport repetitions: a seeded defect becomes exactly one
    // issue group, observed once on each viewport that saw it. Groups are matched
    // on their signature — the field grouping actually keys on — rather than on
    // the human-readable message, which for a failed request is the network error
    // text ("net::ERR_…") and does not contain the URL.
    const seededGroup = (category: IssueGroup['category'], needle: string): IssueGroup => {
      const matches = report.issueGroups.filter(
        (g) => g.category === category && g.signature.includes(needle),
      );
      expect(matches, `expected exactly one ${category} group matching "${needle}"`).toHaveLength(
        1,
      );
      return matches[0];
    };
    for (const group of [
      seededGroup('page-error', 'simulated uncaught error'),
      seededGroup('console', 'simulated runtime error'),
      seededGroup('http-error', '/api/products'),
      seededGroup('failed-request', '/__vibecheck/dead'),
    ]) {
      expect(group.observations).toBe(group.viewports.length);
      expect(group.viewports).toEqual(expect.arrayContaining(renderedNames));
    }

    // The scan status honestly reflects what rendered, and a page this broken
    // can never summarise as anything but a failure.
    expect(report.summary.viewportsChecked).toBe(rendered.length);
    expect(report.summary.viewportsTotal).toBe(3);
    expect(report.summary.status).toBe('fail');

    // On a complete scan (the normal case) the report's own totals are exact.
    // They are only meaningful here because nothing stalled: a stalled viewport
    // can contribute extra failure signatures, such as its aborted document
    // request, which legitimately change the raw and unique counts.
    if (stalled.length === 0) {
      expect(report.scanStatus).toBe('completed');
      expect(report.summary.observations).toEqual({
        console: 9,
        pageErrors: 3,
        failedRequests: 3,
        httpErrors: 3,
        accessibility: 2,
        security: 0,
      });
      expect(report.summary.uniqueIssues).toEqual({
        console: 3,
        pageErrors: 1,
        failedRequests: 1,
        httpErrors: 1,
        accessibility: 2,
        security: 0,
      });
    } else {
      expect(report.scanStatus).toBe('partial');
    }
  }, 180_000);

  it('reports a page it could never render as a failed scan, with a valid report', async () => {
    // A 1 ms navigation budget deterministically stalls every viewport, without
    // depending on machine speed. The scan must not throw, must not claim
    // success, and must still write a schema-valid report to disk.
    const { report, reportJsonPath } = await scan({
      url: server.url,
      outputRoot,
      navigationTimeoutMs: 1,
      settleMs: 0,
    });

    expect(report.viewportResults).toHaveLength(3);
    expect(report.viewportResults.every((r) => !r.ok)).toBe(true);
    expect(report.viewportResults.every((r) => r.error?.startsWith('Navigation failed'))).toBe(
      true,
    );
    expect(report.scanStatus).toBe('failed');
    expect(report.summary.viewportsChecked).toBe(0);

    const persisted: unknown = JSON.parse(readFileSync(reportJsonPath, 'utf8'));
    expect(parseReport(persisted).ok).toBe(true);
  }, 180_000);
});
