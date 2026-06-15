import type { ConsoleMessage, HttpError, Severity } from '@vibecheck/report-schema';

/**
 * Deterministic classification helpers.
 *
 * These map raw browser observations onto the report schema's severity model.
 * They are pure functions so they can be unit-tested without a browser.
 */

/** Normalise a Playwright console type onto the schema console level. */
export function normaliseConsoleLevel(type: string): ConsoleMessage['level'] {
  switch (type) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    case 'debug':
      return 'debug';
    default:
      return 'log';
  }
}

/** Severity for a console message based on its level. */
export function consoleSeverity(level: ConsoleMessage['level']): Severity {
  switch (level) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/** Severity for an HTTP response status >= 400. */
export function httpSeverity(status: number): Severity {
  if (status >= 500) return 'critical';
  return 'error';
}

/** Severity for a network-level request failure. */
export function failedRequestSeverity(): Severity {
  return 'error';
}

/** Severity for an axe-core accessibility impact level. */
export function accessibilitySeverity(impact: string | null | undefined): Severity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'error';
    case 'moderate':
      return 'warning';
    case 'minor':
      return 'info';
    default:
      return 'info';
  }
}

/** Whether an HTTP status counts as an error worth recording (>= 400). */
export function isHttpError(status: number): status is HttpError['status'] {
  return status >= 400 && status <= 599;
}
