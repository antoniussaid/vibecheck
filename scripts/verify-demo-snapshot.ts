/**
 * Verify the curated public demo snapshot (PUB-001).
 *
 * Checks that apps/report-viewer/public/report/report.json:
 *   - is valid JSON and passes the runtime report schema,
 *   - references only safe relative screenshot paths that actually exist,
 *   - contains no absolute local paths or usernames,
 *   - was produced from a loopback target.
 *
 * Exits non-zero on any problem. Used by `npm run verify:demo-snapshot`.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isSafeRelativeReportPath } from '@vibecheck/shared';
import { parseReport } from '@vibecheck/report-schema';

export interface SnapshotVerification {
  ok: boolean;
  problems: string[];
  screenshots: string[];
}

const LOCAL_PATH_PATTERN = /(?:[A-Za-z]:\\)|(?:\/Users\/)|(?:\\Users\\)|ICLOUDDRIVE/i;

export async function verifySnapshot(snapshotDir: string): Promise<SnapshotVerification> {
  const problems: string[] = [];
  const reportPath = join(snapshotDir, 'report.json');

  if (!existsSync(reportPath)) {
    return { ok: false, problems: [`Missing snapshot report: ${reportPath}`], screenshots: [] };
  }

  const raw = await readFile(reportPath, 'utf8');

  if (LOCAL_PATH_PATTERN.test(raw)) {
    problems.push('Snapshot report.json contains a local absolute path or username.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return { ok: false, problems: [`Invalid JSON: ${String(error)}`], screenshots: [] };
  }

  const result = parseReport(parsedJson);
  if (!result.ok) {
    return {
      ok: false,
      problems: [`Schema invalid: ${result.errors.join('; ')}`],
      screenshots: [],
    };
  }

  const report = result.report;
  const screenshots: string[] = [];
  for (const shot of report.screenshots) {
    if (!isSafeRelativeReportPath(shot.path)) {
      problems.push(`Unsafe screenshot path: ${shot.path}`);
      continue;
    }
    const abs = join(snapshotDir, shot.path);
    if (!existsSync(abs)) {
      problems.push(`Referenced screenshot missing: ${shot.path}`);
    } else {
      screenshots.push(shot.path);
    }
  }

  for (const field of [report.requestedUrl, report.finalUrl]) {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(field)) {
      problems.push(`Snapshot was not produced from a loopback target: ${field}`);
    }
  }

  return { ok: problems.length === 0, problems, screenshots };
}

async function main(): Promise<void> {
  const snapshotDir = resolve(process.cwd(), 'apps/report-viewer/public/report');
  const result = await verifySnapshot(snapshotDir);
  if (result.ok) {
    console.log(`✓ Demo snapshot valid (${result.screenshots.length} screenshots): ${snapshotDir}`);
    process.exit(0);
  }
  console.error('✖ Demo snapshot verification failed:');
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exit(1);
}

// Run only when invoked directly (not when imported by demo-scan).
const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1].replace(/\\/g, '/').endsWith('verify-demo-snapshot.ts');
if (invokedDirectly) {
  void main();
}
