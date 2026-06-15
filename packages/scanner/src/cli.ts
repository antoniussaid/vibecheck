#!/usr/bin/env node
import { resolve } from 'node:path';
import { scan, ScanError } from './scanner.js';

interface CliArgs {
  url?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--url') {
      args.url = argv[++i];
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`VibeCheck scanner (Wave 0)

Usage:
  npm run scan -- --url <http://localhost:PORT>

Notes:
  - Only loopback hosts are allowed: localhost, 127.0.0.1, ::1
  - Reports are always written under the project's reports/<runId>/ directory.
    Wave 0 deliberately does not expose a free output path.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.url) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }

  // Wave 0: reports always go under <project>/reports. No free --out (PATH-001).
  const outputRoot = resolve(process.cwd(), 'reports');

  try {
    const { report, reportDir, reportJsonPath } = await scan({
      url: args.url,
      outputRoot,
      onProgress: (message) => console.log(`  · ${message}`),
    });

    const s = report.summary;
    console.log('\nVibeCheck report');
    console.log('────────────────');
    console.log(`  URL:            ${report.requestedUrl}`);
    console.log(`  Scan status:    ${report.scanStatus}`);
    console.log(`  Overall:        ${s.status.toUpperCase()}`);
    console.log(`  Viewports:      ${s.viewportsChecked}/${s.viewportsTotal}`);
    console.log(
      `  Console errors: ${s.uniqueIssues.console} unique · ${s.observations.console} observations`,
    );
    console.log(
      `  Page errors:    ${s.uniqueIssues.pageErrors} unique · ${s.observations.pageErrors} observations`,
    );
    console.log(
      `  Failed reqs:    ${s.uniqueIssues.failedRequests} unique · ${s.observations.failedRequests} observations`,
    );
    console.log(
      `  HTTP errors:    ${s.uniqueIssues.httpErrors} unique · ${s.observations.httpErrors} observations`,
    );
    console.log(
      `  A11y findings:  ${s.uniqueIssues.accessibility} unique · ${s.observations.accessibility} observations`,
    );
    console.log(
      `  Security blocks:${s.uniqueIssues.security} unique · ${s.observations.security} observations`,
    );
    console.log(`\n  Report dir:     ${reportDir}`);
    console.log(`  report.json:    ${reportJsonPath}`);

    // Exit 0: the scan ran. Findings are data, not a tool failure.
    process.exit(0);
  } catch (error) {
    if (error instanceof ScanError) {
      console.error(`\n✖ Scan aborted [${error.code}]: ${error.message}`);
      process.exit(error.code === 'URL_NOT_ALLOWED' ? 2 : 1);
    }
    console.error(`\n✖ Unexpected error: ${String(error)}`);
    process.exit(1);
  }
}

void main();
