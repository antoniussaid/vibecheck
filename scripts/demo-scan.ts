/**
 * Reproducible demo scan.
 *
 * Builds the demo fixture (if needed), serves it on loopback, scans it across
 * three viewports and writes a validated report under reports/<runId>/.
 *
 *   npm run scan:demo              -> ephemeral scan only (ignored by git)
 *   npm run update:demo-snapshot   -> also refresh the COMMITTED curated snapshot
 *                                     in apps/report-viewer/public/report/, then verify it
 *
 * A normal demo scan never overwrites the curated public snapshot; refreshing it
 * is an explicit, separate command.
 */
import { execSync } from 'node:child_process';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scan, serveDirectory } from '@vibecheck/scanner';
import { verifySnapshot } from './verify-demo-snapshot.js';

const repoRoot = process.cwd();
const fixtureDir = resolve(repoRoot, 'apps/demo-fixture');
const fixtureDist = resolve(fixtureDir, 'dist');
const reportsRoot = resolve(repoRoot, 'reports');
const snapshotDir = resolve(repoRoot, 'apps/report-viewer/public/report');

const updateSnapshot = process.argv.includes('--snapshot');

async function ensureFixtureBuilt(): Promise<void> {
  // Always produce a fresh PRODUCTION build with NODE_ENV=production. This never
  // reuses a possibly dev/test bundle (which would double the demo's raw counts
  // via React StrictMode) and matches what the integration test builds.
  console.log('· Building demo fixture (production)…');
  execSync('npm run build -w @vibecheck/demo-fixture', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}

async function writeSnapshot(reportDir: string): Promise<void> {
  await rm(snapshotDir, { recursive: true, force: true });
  await mkdir(snapshotDir, { recursive: true });
  for (const entry of await readdir(reportDir)) {
    if (entry.endsWith('.json') || entry.endsWith('.png')) {
      await copyFile(join(reportDir, entry), join(snapshotDir, entry));
    }
  }
  const verification = await verifySnapshot(snapshotDir);
  if (!verification.ok) {
    throw new Error(`Snapshot verification failed:\n  ${verification.problems.join('\n  ')}`);
  }
  console.log(`· Curated snapshot updated and verified: ${snapshotDir}`);
}

async function main(): Promise<void> {
  await ensureFixtureBuilt();

  const server = await serveDirectory(fixtureDist);
  console.log(`· Serving fixture at ${server.url}`);

  try {
    const { report, reportDir, reportJsonPath } = await scan({
      url: server.url,
      outputRoot: reportsRoot,
      onProgress: (message) => console.log(`  · ${message}`),
    });

    if (updateSnapshot) {
      await writeSnapshot(reportDir);
    }

    const s = report.summary;
    console.log('\nDemo scan complete');
    console.log('──────────────────');
    console.log(`  Overall:        ${s.status.toUpperCase()} (scan: ${report.scanStatus})`);
    console.log(`  Viewports:      ${s.viewportsChecked}/${s.viewportsTotal}`);
    console.log(
      `  Console:        ${s.uniqueIssues.console} unique · ${s.observations.console} obs`,
    );
    console.log(
      `  Page errors:    ${s.uniqueIssues.pageErrors} unique · ${s.observations.pageErrors} obs`,
    );
    console.log(
      `  Failed reqs:    ${s.uniqueIssues.failedRequests} unique · ${s.observations.failedRequests} obs`,
    );
    console.log(
      `  HTTP errors:    ${s.uniqueIssues.httpErrors} unique · ${s.observations.httpErrors} obs`,
    );
    console.log(
      `  A11y:           ${s.uniqueIssues.accessibility} unique · ${s.observations.accessibility} obs`,
    );
    console.log(
      `  Security blocks:${s.uniqueIssues.security} unique · ${s.observations.security} obs`,
    );
    console.log(`\n  Report:         ${reportJsonPath}`);
    if (updateSnapshot) {
      console.log('  Snapshot:       npm run dev:report  (then open the printed URL)');
    } else {
      console.log('  (curated public snapshot left unchanged; use npm run update:demo-snapshot)');
    }
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✖ Demo scan failed: ${String(error)}`);
  process.exit(1);
});
