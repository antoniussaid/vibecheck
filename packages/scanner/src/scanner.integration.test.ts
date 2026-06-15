import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

beforeAll(async () => {
  // Always build the demo fixture as a PRODUCTION bundle, explicitly forcing
  // NODE_ENV=production. Vitest runs with NODE_ENV=test, which would otherwise
  // make @vitejs/plugin-react emit a React *development* bundle (jsxDEV +
  // StrictMode double-invoked effects), doubling the seeded raw event counts
  // (e.g. 18 console errors instead of 9). Forcing production yields the exact
  // same bundle the real demo scan uses, and we never reuse a possibly-dev dist
  // left behind by an earlier run.
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
    // source paths. This guarantees the exact raw-count assertions below run
    // against a production fixture, not a StrictMode-doubled development build.
    expect(fixtureBundle).not.toContain('jsxDEV');
    expect(fixtureBundle).not.toContain('/src/App');
  });

  it('captures the exact deliberately seeded defects with real browser evidence', async () => {
    // Generous (but bounded) per-viewport navigation timeout and settle window so
    // a cold or load-stressed CI runner reliably renders all three viewports and
    // captures every seeded async event (the setTimeout page error and the two
    // fetches). Defaults stay unchanged for production scans.
    const { report, reportDir } = await scan({
      url: server.url,
      outputRoot,
      navigationTimeoutMs: 60_000,
      settleMs: 1_500,
    });

    // Three viewports were attempted and rendered.
    expect(report.viewportResults).toHaveLength(3);
    expect(report.viewportResults.every((r) => r.ok)).toBe(true);
    expect(report.viewportResults.map((r) => r.viewport.name)).toEqual([
      'desktop',
      'tablet',
      'mobile',
    ]);
    expect(report.screenshots).toHaveLength(3);

    // Real screenshot files exist on disk.
    for (const shot of report.screenshots) {
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

    // DEFECTS 4 & 5: the exact axe rule ids (label + image-alt), and no spurious region.
    const ruleIds = report.accessibilityFindings.map((f) => f.ruleId).sort();
    expect(ruleIds).toContain('label');
    expect(ruleIds).toContain('image-alt');
    expect(ruleIds).not.toContain('region');

    // The demo only loads loopback resources: no security blocks.
    expect(report.securityFindings).toHaveLength(0);

    // Exact raw observations: each seeded defect occurs once per viewport on a
    // production build (no StrictMode doubling) → 3 each across 3 viewports.
    expect(report.summary.observations.console).toBe(9);
    expect(report.summary.observations.pageErrors).toBe(3);
    expect(report.summary.observations.failedRequests).toBe(3);
    expect(report.summary.observations.httpErrors).toBe(3);
    expect(report.summary.observations.accessibility).toBe(2);

    // Exact unique issues: deterministic grouping by signature.
    expect(report.summary.uniqueIssues.console).toBe(3);
    expect(report.summary.uniqueIssues.pageErrors).toBe(1);
    expect(report.summary.uniqueIssues.failedRequests).toBe(1);
    expect(report.summary.uniqueIssues.httpErrors).toBe(1);
    expect(report.summary.uniqueIssues.accessibility).toBe(2);

    // Status: a clean, complete scan of a failing page.
    expect(report.scanStatus).toBe('completed');
    expect(report.summary.status).toBe('fail');
  }, 180_000);
});
