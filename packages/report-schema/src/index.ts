export * from './schema.js';
export {
  computeSummary,
  groupIssues,
  deriveScanStatus,
  type SummaryInput,
  type ScanStatusFlags,
} from './summary.js';

// Re-export the URL/path safety helpers so consumers (e.g. the report viewer)
// can validate report data without taking a separate direct dependency on
// @vibecheck/shared.
export { isSafeRelativeReportPath, isSafeHttpUrl } from '@vibecheck/shared';
