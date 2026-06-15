import { describe, expect, it } from 'vitest';
import { createRunId, isSafeRunId, timestampSlug, toFilesystemSafe } from './run-id.js';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

describe('createRunId', () => {
  it('produces a filesystem-safe id', () => {
    const id = createRunId(new Date('2026-06-14T10:15:30.123Z'));
    expect(id).toMatch(SAFE_SEGMENT);
    expect(id).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('starts with a sortable timestamp', () => {
    const id = createRunId(new Date('2026-06-14T10:15:30.123Z'));
    expect(id.startsWith('20260614-101530-123-')).toBe(true);
  });

  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRunId()));
    expect(ids.size).toBe(200);
  });
});

describe('timestampSlug', () => {
  it('zero-pads all fields', () => {
    expect(timestampSlug(new Date('2026-01-02T03:04:05.006Z'))).toBe('20260102-030405-006');
  });
});

describe('toFilesystemSafe', () => {
  it('replaces unsafe characters', () => {
    expect(toFilesystemSafe('a/b\\c:d*e')).toMatch(SAFE_SEGMENT);
  });

  it('avoids Windows reserved names', () => {
    expect(toFilesystemSafe('CON')).not.toBe('CON');
  });

  it('falls back when input is empty after sanitising', () => {
    expect(toFilesystemSafe('///', 'fallback')).toBe('fallback');
  });
});

describe('isSafeRunId', () => {
  it('accepts a generated run id and simple safe ids', () => {
    expect(isSafeRunId(createRunId())).toBe(true);
    expect(isSafeRunId('my-run_01')).toBe(true);
  });

  it('rejects traversal, separators, drive letters and absolute paths', () => {
    expect(isSafeRunId('..')).toBe(false);
    expect(isSafeRunId('../escape')).toBe(false);
    expect(isSafeRunId('a/b')).toBe(false);
    expect(isSafeRunId('a\\b')).toBe(false);
    expect(isSafeRunId('C:\\temp')).toBe(false);
    expect(isSafeRunId('/abs')).toBe(false);
  });

  it('rejects reserved names, empty and over-long values', () => {
    expect(isSafeRunId('CON')).toBe(false);
    expect(isSafeRunId('')).toBe(false);
    expect(isSafeRunId('a'.repeat(81))).toBe(false);
    expect(isSafeRunId(42 as unknown)).toBe(false);
  });
});
