import type {
  AccessibilityFinding,
  ConsoleMessage,
  FailedRequest,
  HttpError,
  IssueCounts,
  IssueGroup,
  PageError,
  ReportSummary,
  ScanStatus,
  SecurityFinding,
  Severity,
  SummaryStatus,
  ViewportName,
} from './schema.js';

/**
 * Deterministic summary + grouping engine.
 *
 * Pure and deterministic: identical input always yields identical output. It
 * distinguishes **raw observations** (every event, including the same defect
 * repeated across viewports) from **unique issues** (deterministic grouping),
 * so the UI never sells one defect seen on three viewports as three defects.
 *
 * Quality status (top to bottom):
 *   FAIL            any blocking finding: a page error, a console error, a
 *                   failed request, an HTTP error, a CRITICAL accessibility
 *                   finding, or a blocked-egress security finding.
 *   NEEDS ATTENTION else any accessibility finding, console warning, or a
 *                   viewport that failed to render.
 *   PASS            otherwise.
 */
export interface SummaryInput {
  viewportResults: { ok: boolean }[];
  consoleMessages: ConsoleMessage[];
  pageErrors: PageError[];
  failedRequests: FailedRequest[];
  httpErrors: HttpError[];
  accessibilityFindings: AccessibilityFinding[];
  securityFindings: SecurityFinding[];
}

const VIEWPORT_ORDER: ViewportName[] = ['desktop', 'tablet', 'mobile'];
const SEVERITY_ORDER: Severity[] = ['info', 'warning', 'error', 'critical'];

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function sortViewports(viewports: Set<ViewportName>): ViewportName[] {
  return VIEWPORT_ORDER.filter((v) => viewports.has(v));
}

interface RawIssue {
  signature: string;
  severity: Severity;
  message: string;
  viewport: ViewportName;
  url: string | null;
  source: string | null;
}

function groupCategory(category: IssueGroup['category'], items: RawIssue[]): IssueGroup[] {
  const map = new Map<string, IssueGroup & { _viewports: Set<ViewportName> }>();
  for (const item of items) {
    const existing = map.get(item.signature);
    if (existing) {
      existing.observations += 1;
      existing.severity = maxSeverity(existing.severity, item.severity);
      existing._viewports.add(item.viewport);
    } else {
      map.set(item.signature, {
        category,
        signature: item.signature,
        severity: item.severity,
        message: item.message,
        observations: 1,
        viewports: [],
        url: item.url,
        source: item.source,
        _viewports: new Set([item.viewport]),
      });
    }
  }
  // Deterministic order: by signature.
  return Array.from(map.values())
    .sort((a, b) => a.signature.localeCompare(b.signature))
    .map(({ _viewports, ...group }) => ({ ...group, viewports: sortViewports(_viewports) }));
}

/** Group all raw observations into deterministic unique-issue groups. */
export function groupIssues(input: SummaryInput): IssueGroup[] {
  const console = groupCategory(
    'console',
    input.consoleMessages
      .filter((m) => m.level === 'error')
      .map((m) => ({
        signature: `console|${m.message}|${m.source ?? ''}`,
        severity: m.severity,
        message: m.message,
        viewport: m.viewport,
        url: m.url,
        source: m.source,
      })),
  );
  const pageErrors = groupCategory(
    'page-error',
    input.pageErrors.map((m) => ({
      signature: `page-error|${m.message}`,
      severity: m.severity,
      message: m.message,
      viewport: m.viewport,
      url: m.url,
      source: m.source,
    })),
  );
  const failedRequests = groupCategory(
    'failed-request',
    input.failedRequests.map((m) => ({
      signature: `failed-request|${m.requestUrl}|${m.message}`,
      severity: m.severity,
      message: m.message,
      viewport: m.viewport,
      url: m.requestUrl,
      source: null,
    })),
  );
  const httpErrors = groupCategory(
    'http-error',
    input.httpErrors.map((m) => ({
      signature: `http-error|${m.requestUrl}|${m.status}`,
      severity: m.severity,
      message: m.message,
      viewport: m.viewport,
      url: m.requestUrl,
      source: null,
    })),
  );
  const accessibility = groupCategory(
    'accessibility',
    input.accessibilityFindings.map((m) => ({
      signature: `accessibility|${m.ruleId}`,
      severity: m.severity,
      message: `${m.ruleId}: ${m.message}`,
      viewport: m.viewport,
      url: m.helpUrl,
      source: null,
    })),
  );
  const security = groupCategory(
    'security-policy',
    input.securityFindings.map((m) => ({
      signature: `security-policy|${m.kind}|${m.host ?? ''}|${m.resourceType ?? ''}`,
      severity: m.severity,
      message: m.message,
      viewport: m.viewport,
      url: m.requestUrl,
      source: null,
    })),
  );
  return [
    ...console,
    ...pageErrors,
    ...failedRequests,
    ...httpErrors,
    ...accessibility,
    ...security,
  ];
}

function countByCategory(groups: IssueGroup[], category: IssueGroup['category']): number {
  return groups.filter((g) => g.category === category).length;
}

export function computeSummary(input: SummaryInput): ReportSummary {
  const groups = groupIssues(input);

  const consoleErrors = input.consoleMessages.filter((m) => m.level === 'error').length;
  const consoleWarnings = input.consoleMessages.filter((m) => m.level === 'warning').length;
  const criticalA11y = input.accessibilityFindings.filter((f) => f.severity === 'critical').length;
  const viewportFailures = input.viewportResults.filter((r) => !r.ok).length;

  const observations: IssueCounts = {
    console: consoleErrors,
    pageErrors: input.pageErrors.length,
    failedRequests: input.failedRequests.length,
    httpErrors: input.httpErrors.length,
    accessibility: input.accessibilityFindings.length,
    security: input.securityFindings.length,
  };

  const uniqueIssues: IssueCounts = {
    console: countByCategory(groups, 'console'),
    pageErrors: countByCategory(groups, 'page-error'),
    failedRequests: countByCategory(groups, 'failed-request'),
    httpErrors: countByCategory(groups, 'http-error'),
    accessibility: countByCategory(groups, 'accessibility'),
    security: countByCategory(groups, 'security-policy'),
  };

  const hasBlocking =
    observations.pageErrors > 0 ||
    observations.console > 0 ||
    observations.failedRequests > 0 ||
    observations.httpErrors > 0 ||
    observations.security > 0 ||
    criticalA11y > 0;
  const hasAttention =
    observations.accessibility > 0 || consoleWarnings > 0 || viewportFailures > 0;

  let status: SummaryStatus;
  if (hasBlocking) {
    status = 'fail';
  } else if (hasAttention) {
    status = 'needs-attention';
  } else {
    status = 'pass';
  }

  const topIssues: string[] = [];
  const addTop = (unique: number, observed: number, label: string) => {
    if (unique > 0) {
      topIssues.push(
        `${unique} unique ${label}${unique === 1 ? '' : 's'} · ${observed} observation${observed === 1 ? '' : 's'}`,
      );
    }
  };
  addTop(uniqueIssues.security, observations.security, 'security block');
  addTop(uniqueIssues.pageErrors, observations.pageErrors, 'page error');
  addTop(uniqueIssues.console, observations.console, 'console error');
  addTop(uniqueIssues.httpErrors, observations.httpErrors, 'HTTP error');
  addTop(uniqueIssues.failedRequests, observations.failedRequests, 'failed request');
  addTop(uniqueIssues.accessibility, observations.accessibility, 'accessibility finding');

  return {
    viewportsChecked: input.viewportResults.filter((r) => r.ok).length,
    viewportsTotal: input.viewportResults.length,
    observations,
    uniqueIssues,
    status,
    topIssues: topIssues.slice(0, 6),
  };
}

export interface ScanStatusFlags {
  viewportsOk: number;
  viewportsTotal: number;
  /** True once accessibility analysis succeeded on at least one viewport. */
  accessibilityRan: boolean;
  /** Number of blocked-egress security findings. */
  securityBlocks: number;
}

/**
 * Derive the scan-completeness status from explicit flags.
 *
 * - `failed`    : no viewport rendered.
 * - `partial`   : some viewport failed, accessibility never ran, or at least one
 *                 egress policy block occurred (the page could not be observed
 *                 exactly as authored).
 * - `completed` : all viewports rendered, accessibility ran, no egress blocks.
 *
 * A later accessibility success clears an earlier failure (no sticky partial),
 * and a security block never yields a misleading `completed`.
 */
export function deriveScanStatus(flags: ScanStatusFlags): ScanStatus {
  if (flags.viewportsOk === 0) return 'failed';
  if (
    flags.viewportsOk < flags.viewportsTotal ||
    !flags.accessibilityRan ||
    flags.securityBlocks > 0
  ) {
    return 'partial';
  }
  return 'completed';
}
