import {
  isSafeHttpUrl,
  isSafeRelativeReportPath,
  parseReport,
  type VibeCheckReport,
} from '@vibecheck/report-schema';

/**
 * Pure (React-free) validation helpers for the report viewer, so the consumer
 * boundary is actually enforced at runtime and unit-tested without rendering.
 */

export type ReportParseResult =
  | { ok: true; report: VibeCheckReport }
  | { ok: false; message: string };

/** Parse + schema-validate raw report JSON text. Never throws. */
export function parseReportText(text: string): ReportParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The report file is not valid JSON.' };
  }
  const result = parseReport(json);
  if (!result.ok) {
    return {
      ok: false,
      message: `The report failed schema validation: ${result.errors.slice(0, 3).join('; ')}`,
    };
  }
  return { ok: true, report: result.report };
}

/** Only http(s) help links are clickable; everything else is rendered as text. */
export function isSafeHelpUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && isSafeHttpUrl(url);
}

/** Build a screenshot URL only for safe, relative, in-directory paths. */
export function safeScreenshotUrl(base: string, path: string): string | null {
  if (!isSafeRelativeReportPath(path)) return null;
  return `${base}/${path}`;
}
