import { describe, expect, it } from 'vitest';
import { computeSummary, deriveScanStatus, groupIssues, type SummaryInput } from './summary.js';
import type { AccessibilityFinding, ConsoleMessage, ViewportName } from './schema.js';

const TS = '2026-06-14T10:15:31.000Z';

function emptyInput(): SummaryInput {
  return {
    viewportResults: [],
    consoleMessages: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    accessibilityFindings: [],
    securityFindings: [],
  };
}

function consoleError(
  viewport: ViewportName,
  message = 'Boom',
  source = 'app.js:1',
): ConsoleMessage {
  return {
    category: 'console',
    level: 'error',
    severity: 'error',
    message,
    source,
    viewport,
    url: null,
    timestamp: TS,
  };
}

function a11y(severity: AccessibilityFinding['severity']): AccessibilityFinding {
  return {
    category: 'accessibility',
    severity,
    ruleId: 'label',
    message: 'Form element has no label',
    impact: severity === 'critical' ? 'critical' : 'moderate',
    helpUrl: null,
    nodes: [],
    viewport: 'desktop',
    timestamp: TS,
  };
}

const VIEWPORTS: ViewportName[] = ['desktop', 'tablet', 'mobile'];

describe('computeSummary', () => {
  it('computes PASS when there are no findings', () => {
    const input = emptyInput();
    input.viewportResults = VIEWPORTS.map(() => ({ ok: true }));
    const summary = computeSummary(input);
    expect(summary.status).toBe('pass');
    expect(summary.viewportsChecked).toBe(3);
    expect(summary.viewportsTotal).toBe(3);
    expect(summary.topIssues).toEqual([]);
  });

  it('computes NEEDS ATTENTION for a non-critical accessibility finding only', () => {
    const input = emptyInput();
    input.viewportResults = [{ ok: true }];
    input.accessibilityFindings = [a11y('warning')];
    const summary = computeSummary(input);
    expect(summary.status).toBe('needs-attention');
    expect(summary.observations.accessibility).toBe(1);
  });

  it('computes FAIL when a console error is present', () => {
    const input = emptyInput();
    input.viewportResults = [{ ok: true }];
    input.consoleMessages = [consoleError('desktop')];
    expect(computeSummary(input).status).toBe('fail');
  });

  it('computes FAIL on a blocked-egress security finding', () => {
    const input = emptyInput();
    input.viewportResults = [{ ok: true }];
    input.securityFindings = [
      {
        category: 'security-policy',
        severity: 'critical',
        kind: 'blocked-request',
        message: 'blocked',
        requestUrl: 'https://example.invalid/x',
        host: 'example.invalid',
        resourceType: 'script',
        viewport: 'desktop',
        timestamp: TS,
      },
    ];
    const summary = computeSummary(input);
    expect(summary.status).toBe('fail');
    expect(summary.observations.security).toBe(1);
    expect(summary.uniqueIssues.security).toBe(1);
  });

  it('separates raw observations from unique issues across viewports', () => {
    const input = emptyInput();
    input.viewportResults = VIEWPORTS.map(() => ({ ok: true }));
    // Same console error on all three viewports = 1 unique issue, 3 observations.
    input.consoleMessages = VIEWPORTS.map((v) => consoleError(v));
    const summary = computeSummary(input);
    expect(summary.observations.console).toBe(3);
    expect(summary.uniqueIssues.console).toBe(1);
    expect(summary.topIssues[0]).toContain('1 unique console error');
    expect(summary.topIssues[0]).toContain('3 observations');
  });

  it('keeps different messages as separate unique issues', () => {
    const input = emptyInput();
    input.viewportResults = [{ ok: true }];
    input.consoleMessages = [consoleError('desktop', 'A'), consoleError('desktop', 'B')];
    expect(computeSummary(input).uniqueIssues.console).toBe(2);
  });

  it('is deterministic for identical input', () => {
    const build = (): SummaryInput => {
      const input = emptyInput();
      input.viewportResults = VIEWPORTS.map(() => ({ ok: true }));
      input.consoleMessages = VIEWPORTS.map((v) => consoleError(v));
      input.accessibilityFindings = [a11y('warning')];
      return input;
    };
    expect(computeSummary(build())).toEqual(computeSummary(build()));
    expect(groupIssues(build())).toEqual(groupIssues(build()));
  });
});

describe('groupIssues', () => {
  it('groups three identical console errors into one group with three observations', () => {
    const input = emptyInput();
    input.consoleMessages = VIEWPORTS.map((v) => consoleError(v));
    const groups = groupIssues(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].observations).toBe(3);
    expect(groups[0].viewports).toEqual(['desktop', 'tablet', 'mobile']);
  });
});

describe('deriveScanStatus', () => {
  it('returns completed when everything succeeded', () => {
    expect(
      deriveScanStatus({
        viewportsOk: 3,
        viewportsTotal: 3,
        accessibilityRan: true,
        securityBlocks: 0,
      }),
    ).toBe('completed');
  });

  it('returns partial when a viewport failed', () => {
    expect(
      deriveScanStatus({
        viewportsOk: 2,
        viewportsTotal: 3,
        accessibilityRan: true,
        securityBlocks: 0,
      }),
    ).toBe('partial');
  });

  it('returns partial when accessibility never ran', () => {
    expect(
      deriveScanStatus({
        viewportsOk: 3,
        viewportsTotal: 3,
        accessibilityRan: false,
        securityBlocks: 0,
      }),
    ).toBe('partial');
  });

  it('returns partial when an egress block occurred (not completed)', () => {
    expect(
      deriveScanStatus({
        viewportsOk: 3,
        viewportsTotal: 3,
        accessibilityRan: true,
        securityBlocks: 1,
      }),
    ).toBe('partial');
  });

  it('returns failed when no viewport rendered', () => {
    expect(
      deriveScanStatus({
        viewportsOk: 0,
        viewportsTotal: 3,
        accessibilityRan: false,
        securityBlocks: 0,
      }),
    ).toBe('failed');
  });
});
