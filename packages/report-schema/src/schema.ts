import { z } from 'zod';
import { isSafeRelativeReportPath } from '@vibecheck/shared';

/**
 * Versioned VibeCheck report schema.
 *
 * The schema is the contract between the scanner (producer) and the report
 * viewer (consumer). Every field is derived from real, observed browser data.
 * No field is AI-generated.
 */
export const SCHEMA_VERSION = '1.1.0' as const;

export const Severity = z.enum(['info', 'warning', 'error', 'critical']);
export type Severity = z.infer<typeof Severity>;

export const ViewportName = z.enum(['desktop', 'tablet', 'mobile']);
export type ViewportName = z.infer<typeof ViewportName>;

export const ScanStatus = z.enum(['completed', 'partial', 'failed']);
export type ScanStatus = z.infer<typeof ScanStatus>;

export const SummaryStatus = z.enum(['pass', 'needs-attention', 'fail']);
export type SummaryStatus = z.infer<typeof SummaryStatus>;

const isoTimestamp = z.string().datetime({ offset: true });

const relativeReportPath = z.string().refine(isSafeRelativeReportPath, {
  message: 'screenshot path must be relative and stay inside the report directory',
});

export const Viewport = z.object({
  name: ViewportName,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Viewport = z.infer<typeof Viewport>;

export const Screenshot = z.object({
  viewport: ViewportName,
  path: relativeReportPath,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Screenshot = z.infer<typeof Screenshot>;

export const ViewportResult = z.object({
  viewport: Viewport,
  ok: z.boolean(),
  title: z.string(),
  finalUrl: z.string(),
  screenshotPath: relativeReportPath.nullable(),
  error: z.string().nullable(),
});
export type ViewportResult = z.infer<typeof ViewportResult>;

export const ConsoleMessage = z.object({
  category: z.literal('console'),
  level: z.enum(['log', 'debug', 'info', 'warning', 'error']),
  severity: Severity,
  message: z.string(),
  source: z.string().nullable(),
  viewport: ViewportName,
  url: z.string().nullable(),
  timestamp: isoTimestamp,
});
export type ConsoleMessage = z.infer<typeof ConsoleMessage>;

export const PageError = z.object({
  category: z.literal('page-error'),
  severity: Severity,
  message: z.string(),
  stack: z.string().nullable(),
  source: z.string().nullable(),
  viewport: ViewportName,
  url: z.string().nullable(),
  timestamp: isoTimestamp,
});
export type PageError = z.infer<typeof PageError>;

export const FailedRequest = z.object({
  category: z.literal('failed-request'),
  severity: Severity,
  message: z.string(),
  requestUrl: z.string(),
  method: z.string(),
  resourceType: z.string().nullable(),
  viewport: ViewportName,
  timestamp: isoTimestamp,
});
export type FailedRequest = z.infer<typeof FailedRequest>;

export const HttpError = z.object({
  category: z.literal('http-error'),
  severity: Severity,
  message: z.string(),
  requestUrl: z.string(),
  status: z.number().int().min(400).max(599),
  statusText: z.string().nullable(),
  method: z.string(),
  resourceType: z.string().nullable(),
  viewport: ViewportName,
  timestamp: isoTimestamp,
});
export type HttpError = z.infer<typeof HttpError>;

export const AccessibilityNode = z.object({
  target: z.array(z.string()),
  html: z.string().nullable(),
});

export const AccessibilityFinding = z.object({
  category: z.literal('accessibility'),
  severity: Severity,
  ruleId: z.string(),
  message: z.string(),
  impact: z.enum(['minor', 'moderate', 'serious', 'critical']).nullable(),
  helpUrl: z.string().nullable(),
  nodes: z.array(AccessibilityNode),
  viewport: ViewportName,
  timestamp: isoTimestamp,
});
export type AccessibilityFinding = z.infer<typeof AccessibilityFinding>;

/**
 * A request that was aborted because it violated the loopback egress policy
 * (external host, file:, blocked WebSocket, or a navigation that escaped
 * loopback). These are policy findings, not ordinary server failures.
 */
export const SecurityFinding = z.object({
  category: z.literal('security-policy'),
  severity: Severity,
  kind: z.enum(['blocked-request', 'blocked-websocket', 'navigation-escape']),
  message: z.string(),
  requestUrl: z.string(),
  host: z.string().nullable(),
  resourceType: z.string().nullable(),
  viewport: ViewportName,
  timestamp: isoTimestamp,
});
export type SecurityFinding = z.infer<typeof SecurityFinding>;

export const IssueCategory = z.enum([
  'console',
  'page-error',
  'failed-request',
  'http-error',
  'accessibility',
  'security-policy',
]);
export type IssueCategory = z.infer<typeof IssueCategory>;

/**
 * A deterministic grouping of raw observations into a single distinct issue,
 * so the UI can show "N unique issues · M observations across K viewports"
 * instead of inflating viewport repetitions into separate defects.
 */
export const IssueGroup = z.object({
  category: IssueCategory,
  signature: z.string(),
  severity: Severity,
  message: z.string(),
  observations: z.number().int().min(1),
  viewports: z.array(ViewportName),
  url: z.string().nullable(),
  source: z.string().nullable(),
});
export type IssueGroup = z.infer<typeof IssueGroup>;

/** Per-category integer counts (used for both raw observations and unique issues). */
export const IssueCounts = z.object({
  console: z.number().int().min(0),
  pageErrors: z.number().int().min(0),
  failedRequests: z.number().int().min(0),
  httpErrors: z.number().int().min(0),
  accessibility: z.number().int().min(0),
  security: z.number().int().min(0),
});
export type IssueCounts = z.infer<typeof IssueCounts>;

export const ReportSummary = z.object({
  viewportsChecked: z.number().int().min(0),
  viewportsTotal: z.number().int().min(0),
  /** Raw counts: every observation, including viewport repetitions. */
  observations: IssueCounts,
  /** Distinct issues after deterministic grouping. */
  uniqueIssues: IssueCounts,
  status: SummaryStatus,
  topIssues: z.array(z.string()),
});
export type ReportSummary = z.infer<typeof ReportSummary>;

export const Browser = z.object({
  name: z.string(),
  version: z.string(),
  engine: z.string(),
});
export type Browser = z.infer<typeof Browser>;

export const VibeCheckReport = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: z.string().min(1),
  requestedUrl: z.string(),
  finalUrl: z.string(),
  startedAt: isoTimestamp,
  completedAt: isoTimestamp,
  durationMs: z.number().int().min(0),
  scanStatus: ScanStatus,
  browser: Browser,
  viewportResults: z.array(ViewportResult),
  screenshots: z.array(Screenshot),
  consoleMessages: z.array(ConsoleMessage),
  pageErrors: z.array(PageError),
  failedRequests: z.array(FailedRequest),
  httpErrors: z.array(HttpError),
  accessibilityFindings: z.array(AccessibilityFinding),
  securityFindings: z.array(SecurityFinding),
  issueGroups: z.array(IssueGroup),
  summary: ReportSummary,
});
export type VibeCheckReport = z.infer<typeof VibeCheckReport>;

export type ParseResult = { ok: true; report: VibeCheckReport } | { ok: false; errors: string[] };

/** Validate an unknown value against the report schema. */
export function parseReport(value: unknown): ParseResult {
  const result = VibeCheckReport.safeParse(value);
  if (result.success) {
    return { ok: true, report: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return { ok: false, errors };
}
