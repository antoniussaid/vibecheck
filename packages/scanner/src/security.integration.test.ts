import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scan, ScanError } from './scanner.js';
import { serveDirectory, type StaticServer } from './static-server.js';
import type { VibeCheckReport } from '@vibecheck/report-schema';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const fixturesRoot = resolve(here, '../test-fixtures');
const tmpRoot = resolve(repoRoot, '.tmp-test');

let outputRoot: string;

beforeAll(async () => {
  await mkdir(tmpRoot, { recursive: true });
  outputRoot = await mkdtemp(join(tmpRoot, 'sec-'));
}, 60_000);

afterAll(async () => {
  // maxRetries handles transient EBUSY when the project folder is being synced.
  if (outputRoot) {
    await rm(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => {},
    );
  }
});

// A generous navigation budget: these scans drive a real browser across three
// viewports on a possibly loaded machine, and a stalled viewport would turn an
// egress assertion into a confusing timing failure. Production defaults are
// deliberately much lower and stay unchanged.
const SCAN_BUDGET = { navigationTimeoutMs: 60_000, settleMs: 1_500 } as const;

async function scanDir(
  fixture: string,
  pathAndQuery = '',
): Promise<{ report: VibeCheckReport; server: StaticServer }> {
  const server = await serveDirectory(join(fixturesRoot, fixture));
  try {
    const { report } = await scan({ url: server.url + pathAndQuery, outputRoot, ...SCAN_BUDGET });
    return { report, server };
  } finally {
    await server.close();
  }
}

function hasInvalidHost(value: string): boolean {
  return value.includes('example.invalid');
}

describe('egress containment', () => {
  it('rejects a disallowed initial URL with ScanError(URL_NOT_ALLOWED)', async () => {
    await expect(scan({ url: 'https://example.com', outputRoot })).rejects.toMatchObject({
      name: 'ScanError',
      code: 'URL_NOT_ALLOWED',
    });
    // sanity: it is really our typed error
    const error = await scan({ url: 'http://10.0.0.5', outputRoot }).catch((e) => e);
    expect(error).toBeInstanceOf(ScanError);
  });

  it('blocks external subresources (script/style/font/image/iframe/fetch) and records them', async () => {
    const { report } = await scanDir('external-resources');

    // Real security findings were produced.
    expect(report.securityFindings.length).toBeGreaterThan(0);
    const blockedHosts = report.securityFindings.map((f) => f.host);
    expect(blockedHosts).toContain('example.invalid');

    // No external host was ever successfully contacted.
    for (const e of report.httpErrors) expect(hasInvalidHost(e.requestUrl)).toBe(false);
    for (const e of report.failedRequests) expect(hasInvalidHost(e.requestUrl)).toBe(false);
    expect(hasInvalidHost(report.finalUrl)).toBe(false);

    // Blocked egress must not look like a clean success.
    expect(report.scanStatus).not.toBe('completed');
    expect(report.summary.status).toBe('fail');
    expect(report.summary.observations.security).toBeGreaterThan(0);
  }, 180_000);

  it('blocks an external WebSocket attempt', async () => {
    const { report } = await scanDir('external-resources');
    const wsBlocks = report.securityFindings.filter((f) => f.kind === 'blocked-websocket');
    // The installed Playwright exposes routeWebSocket; expect the WS to be blocked.
    expect(wsBlocks.length).toBeGreaterThanOrEqual(1);
    expect(wsBlocks.every((f) => hasInvalidHost(f.requestUrl))).toBe(true);
  }, 180_000);

  it('blocks a loopback->external redirect and never contacts the external host', async () => {
    const target = 'http://example.invalid/landing';
    const { report } = await scanDir(
      'clean',
      `__vibecheck/redirect?to=${encodeURIComponent(target)}`,
    );

    // The recorded final URL stays on a loopback host (the redirect endpoint),
    // never the external target — even though the loopback URL's query echoes it.
    const finalHost = new URL(report.finalUrl).hostname;
    expect(['127.0.0.1', 'localhost', '::1']).toContain(finalHost);
    const escaped = report.securityFindings.some((f) => hasInvalidHost(f.requestUrl));
    expect(escaped).toBe(true);
    expect(report.scanStatus).not.toBe('completed');
  }, 180_000);

  it('allows a loopback->loopback redirect', async () => {
    const server = await serveDirectory(join(fixturesRoot, 'clean'));
    try {
      const target = server.url + 'other.html';
      const { report } = await scan({
        url: server.url + `__vibecheck/redirect?to=${encodeURIComponent(target)}`,
        outputRoot,
        ...SCAN_BUDGET,
      });
      expect(report.securityFindings).toHaveLength(0);
      expect(report.finalUrl).toContain('other.html');
      expect(report.scanStatus).toBe('completed');
    } finally {
      await server.close();
    }
  }, 180_000);

  it('a blocked service worker cannot reach an external host', async () => {
    const { report } = await scanDir('service-worker');
    // The external SW beacon is never actually contacted.
    for (const e of report.httpErrors) expect(hasInvalidHost(e.requestUrl)).toBe(false);
    for (const e of report.failedRequests) expect(hasInvalidHost(e.requestUrl)).toBe(false);
    // Any external attempt that did occur is a recorded block, not real egress.
    for (const f of report.securityFindings) {
      if (hasInvalidHost(f.requestUrl)) expect(f.kind).not.toBe('navigation-escape');
    }
  }, 180_000);
});
