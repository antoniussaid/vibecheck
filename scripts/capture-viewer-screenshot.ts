/**
 * Capture the shared images of the report viewer.
 *
 *   npm run update:viewer-screenshot
 *
 * Builds the viewer, serves it on loopback, and photographs the overview of the
 * committed demo snapshot twice:
 *
 *   docs/assets/report-viewer.png        the README image
 *   apps/report-viewer/public/og-image.png   the social preview card
 *
 * Both are therefore reproducible: they always show the report that is checked
 * into apps/report-viewer/public/report/, never a hand-made mockup. The snapshot
 * carries a fixed scan time, so re-running this on an unchanged snapshot yields
 * the same pictures.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { serveDirectory } from '@vibecheck/scanner';

const repoRoot = process.cwd();
const viewerDist = resolve(repoRoot, 'apps/report-viewer/dist');
const snapshot = resolve(repoRoot, 'apps/report-viewer/public/report/report.json');
const outputDir = resolve(repoRoot, 'docs/assets');
const readmeShot = resolve(outputDir, 'report-viewer.png');
const ogShot = resolve(repoRoot, 'apps/report-viewer/public/og-image.png');

/** The overview fits in one 1440x900 frame; 2x keeps it crisp on retina. */
const FRAME = { width: 1440, height: 900 };
/** Open Graph's expected 1.91:1 card. Rendered at 2x for high-density displays. */
const OG_FRAME = { width: 1200, height: 630 };

async function main(): Promise<void> {
  if (!existsSync(snapshot)) {
    throw new Error(`No curated snapshot at ${snapshot}. Run: npm run update:demo-snapshot`);
  }

  console.log('· Building the report viewer (production)…');
  execSync('npm run build:viewer', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  await mkdir(outputDir, { recursive: true });
  const server = await serveDirectory(viewerDist);
  const browser = await chromium.launch({ headless: true });

  /** Load the overview and wait until every device preview has actually decoded. */
  async function shoot(frame: { width: number; height: number }, path: string): Promise<void> {
    const page = await browser.newPage({ viewport: frame, deviceScaleFactor: 2 });
    await page.goto(server.url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('.hero__shots img', { timeout: 30_000 });
    await page.waitForFunction(
      () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
      undefined,
      { timeout: 30_000 },
    );
    await page.screenshot({ path });
    await page.close();
    console.log(`· Wrote ${path} (${frame.width}x${frame.height} @2x)`);
  }

  try {
    console.log(`· Serving the viewer at ${server.url}`);
    await shoot(FRAME, readmeShot);
    await shoot(OG_FRAME, ogShot);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✖ Screenshot capture failed: ${String(error)}`);
  process.exit(1);
});
