import { useEffect, useState } from 'react';
import type { SummaryStatus, VibeCheckReport } from '@vibecheck/report-schema';
import { parseReportText, safeScreenshotUrl } from './report-validation.js';

/** Base path (relative) where the curated demo snapshot is published. */
export const REPORT_BASE = './report';

export type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: VibeCheckReport };

/** Resolve a relative screenshot path to a URL, or null if it is unsafe. */
export function screenshotUrl(path: string): string | null {
  return safeScreenshotUrl(REPORT_BASE, path);
}

export function statusLabel(status: SummaryStatus): string {
  switch (status) {
    case 'pass':
      return 'Pass';
    case 'needs-attention':
      return 'Needs attention';
    case 'fail':
      return 'Fail';
  }
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Load and runtime-validate the published report. A missing file yields the
 * empty state; malformed JSON or a schema-invalid report yields an explicit
 * error state (never a partially rendered, unvalidated report).
 */
export function useReport(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const set = (next: LoadState) => {
      if (!cancelled) setState(next);
    };

    fetch(`${REPORT_BASE}/report.json`, { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) {
          set({ status: 'empty' });
          return;
        }
        if (!response.ok) {
          set({ status: 'error', message: `Failed to load report (HTTP ${response.status}).` });
          return;
        }
        const text = await response.text();
        const parsed = parseReportText(text);
        if (parsed.ok) {
          set({ status: 'ready', report: parsed.report });
        } else {
          set({ status: 'error', message: parsed.message });
        }
      })
      .catch(() => {
        set({ status: 'error', message: 'The report could not be loaded.' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
