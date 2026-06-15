/**
 * Run-ID generation and filesystem-safe name helpers.
 *
 * Run IDs are used as directory names under reports/, so they must be unique,
 * sortable, and safe on Windows and POSIX filesystems.
 */

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]/g;

/** Reserved device names on Windows that must never be used as a path segment. */
const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/**
 * Make an arbitrary string safe to use as a single path segment.
 * Replaces unsafe characters, trims separators, and avoids reserved names.
 */
export function toFilesystemSafe(input: string, fallback = 'item'): string {
  let safe = input.normalize('NFKD').replace(UNSAFE_CHARS, '-');
  safe = safe.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (safe.length === 0) {
    safe = fallback;
  }
  if (WINDOWS_RESERVED.has(safe.toLowerCase())) {
    safe = `${safe}-x`;
  }
  return safe.slice(0, 80);
}

/** Format a Date as a compact, sortable, filesystem-safe timestamp. */
export function timestampSlug(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}` +
    `-${pad(date.getUTCMilliseconds(), 3)}`
  );
}

/**
 * Create a unique, sortable, filesystem-safe run ID, e.g.
 * "20260614-101530-123-7f3a9c". The random suffix avoids collisions when two
 * scans start within the same millisecond.
 */
export function createRunId(date: Date = new Date()): string {
  const random = Math.random().toString(16).slice(2, 8).padEnd(6, '0');
  return `${timestampSlug(date)}-${random}`;
}

/** Allowed run-id characters: ASCII letters, digits, hyphen, underscore. */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Strictly validate a caller-supplied run ID before it is used as a single path
 * segment. Rejects traversal (`..`), separators (`/`, `\`), drive letters,
 * absolute paths, reserved Windows names, and empty/over-long values.
 */
export function isSafeRunId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (!RUN_ID_PATTERN.test(id)) return false;
  if (id === '.' || id === '..') return false;
  if (WINDOWS_RESERVED.has(id.toLowerCase())) return false;
  return true;
}
