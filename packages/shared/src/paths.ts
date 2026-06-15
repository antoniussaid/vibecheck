/**
 * Path-safety helpers for report artifacts.
 *
 * Screenshot references inside a report must stay relative to the report
 * directory. They must never be absolute or escape the directory via "..".
 */

/**
 * True when `candidate` is a safe relative path that stays inside its report
 * directory: not empty, not absolute, no drive letter, no parent traversal,
 * forward-slash separated.
 */
export function isSafeRelativeReportPath(candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }
  // Reject backslashes outright; report paths are normalised to forward slashes.
  if (candidate.includes('\\')) {
    return false;
  }
  // Reject absolute POSIX paths and Windows drive letters (e.g. "C:/...").
  if (candidate.startsWith('/') || /^[a-zA-Z]:/.test(candidate)) {
    return false;
  }
  const segments = candidate.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) {
    return false;
  }
  return true;
}
