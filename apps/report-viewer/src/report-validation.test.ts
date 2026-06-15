import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type VibeCheckReport } from '@vibecheck/report-schema';
import { isSafeHelpUrl, parseReportText, safeScreenshotUrl } from './report-validation.js';

function validReport(): VibeCheckReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: 'run-1',
    requestedUrl: 'http://localhost:4173/',
    finalUrl: 'http://localhost:4173/',
    startedAt: '2026-06-14T10:15:30.000Z',
    completedAt: '2026-06-14T10:15:34.000Z',
    durationMs: 4000,
    scanStatus: 'completed',
    browser: { name: 'chromium', version: '131', engine: 'Blink' },
    viewportResults: [],
    screenshots: [{ viewport: 'desktop', path: 'desktop.png', width: 1440, height: 900 }],
    consoleMessages: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    accessibilityFindings: [],
    securityFindings: [],
    issueGroups: [],
    summary: {
      viewportsChecked: 0,
      viewportsTotal: 0,
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

describe('parseReportText', () => {
  it('accepts a valid report', () => {
    const result = parseReportText(JSON.stringify(validReport()));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid JSON with an error message', () => {
    const result = parseReportText('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('not valid JSON');
  });

  it('rejects a report with missing required fields', () => {
    const broken = validReport() as Partial<VibeCheckReport>;
    delete broken.summary;
    expect(parseReportText(JSON.stringify(broken)).ok).toBe(false);
  });

  it('rejects a wrong schema version', () => {
    const result = parseReportText(JSON.stringify({ ...validReport(), schemaVersion: '0.0.1' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an absolute screenshot path', () => {
    const report = validReport();
    report.screenshots[0].path = 'C:/temp/x.png';
    expect(parseReportText(JSON.stringify(report)).ok).toBe(false);
  });

  it('rejects a traversal screenshot path', () => {
    const report = validReport();
    report.screenshots[0].path = '../x.png';
    expect(parseReportText(JSON.stringify(report)).ok).toBe(false);
  });
});

describe('isSafeHelpUrl', () => {
  it('accepts http(s) and rejects unsafe schemes', () => {
    expect(isSafeHelpUrl('https://dequeuniversity.com/rules/axe/4.10/label')).toBe(true);
    expect(isSafeHelpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHelpUrl('data:text/html,x')).toBe(false);
    expect(isSafeHelpUrl(null)).toBe(false);
  });
});

describe('safeScreenshotUrl', () => {
  it('builds a url for a safe relative path', () => {
    expect(safeScreenshotUrl('./report', 'desktop.png')).toBe('./report/desktop.png');
  });

  it('returns null for unsafe paths', () => {
    expect(safeScreenshotUrl('./report', '../x.png')).toBeNull();
    expect(safeScreenshotUrl('./report', 'C:/x.png')).toBeNull();
  });
});
