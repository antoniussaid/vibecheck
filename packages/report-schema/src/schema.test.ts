import { describe, expect, it } from 'vitest';
import { parseReport, SCHEMA_VERSION, type VibeCheckReport } from './schema.js';

function validReport(): VibeCheckReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: '20260614-101530-123-7f3a9c',
    requestedUrl: 'http://localhost:4173/',
    finalUrl: 'http://localhost:4173/',
    startedAt: '2026-06-14T10:15:30.000Z',
    completedAt: '2026-06-14T10:15:34.000Z',
    durationMs: 4000,
    scanStatus: 'completed',
    browser: { name: 'chromium', version: '131.0.0', engine: 'Blink' },
    viewportResults: [
      {
        viewport: { name: 'desktop', width: 1440, height: 900 },
        ok: true,
        title: 'VibeCheck Demo Shop',
        finalUrl: 'http://localhost:4173/',
        screenshotPath: 'desktop.png',
        error: null,
      },
    ],
    screenshots: [{ viewport: 'desktop', path: 'desktop.png', width: 1440, height: 900 }],
    consoleMessages: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    accessibilityFindings: [],
    securityFindings: [],
    issueGroups: [],
    summary: {
      viewportsChecked: 1,
      viewportsTotal: 1,
      observations: {
        console: 0,
        pageErrors: 0,
        failedRequests: 0,
        httpErrors: 0,
        accessibility: 0,
        security: 0,
      },
      uniqueIssues: {
        console: 0,
        pageErrors: 0,
        failedRequests: 0,
        httpErrors: 0,
        accessibility: 0,
        security: 0,
      },
      status: 'pass',
      topIssues: [],
    },
  };
}

describe('parseReport', () => {
  it('accepts a valid report', () => {
    const result = parseReport(validReport());
    expect(result.ok).toBe(true);
  });

  it('rejects an incomplete report (missing summary)', () => {
    const broken = validReport() as Partial<VibeCheckReport>;
    delete broken.summary;
    const result = parseReport(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('summary');
    }
  });

  it('rejects a report missing securityFindings', () => {
    const broken = validReport() as Partial<VibeCheckReport>;
    delete broken.securityFindings;
    expect(parseReport(broken).ok).toBe(false);
  });

  it('rejects a wrong schema version', () => {
    const report = { ...validReport(), schemaVersion: '9.9.9' };
    expect(parseReport(report).ok).toBe(false);
  });

  it('rejects an absolute screenshot path', () => {
    const report = validReport();
    report.screenshots[0].path = 'C:/temp/desktop.png';
    expect(parseReport(report).ok).toBe(false);
  });

  it('rejects a screenshot path that escapes the report directory', () => {
    const report = validReport();
    report.screenshots[0].path = '../secrets/desktop.png';
    expect(parseReport(report).ok).toBe(false);
  });

  it('rejects an HTTP error with status below 400', () => {
    const report = validReport();
    report.httpErrors = [
      {
        category: 'http-error',
        severity: 'error',
        message: 'unexpected',
        requestUrl: 'http://localhost:4173/x',
        status: 200,
        statusText: 'OK',
        method: 'GET',
        resourceType: 'fetch',
        viewport: 'desktop',
        timestamp: '2026-06-14T10:15:31.000Z',
      },
    ];
    expect(parseReport(report).ok).toBe(false);
  });

  it('accepts a security finding', () => {
    const report = validReport();
    report.securityFindings = [
      {
        category: 'security-policy',
        severity: 'critical',
        kind: 'blocked-request',
        message: 'Blocked external request to example.invalid',
        requestUrl: 'https://example.invalid/x.js',
        host: 'example.invalid',
        resourceType: 'script',
        viewport: 'desktop',
        timestamp: '2026-06-14T10:15:31.000Z',
      },
    ];
    expect(parseReport(report).ok).toBe(true);
  });
});
