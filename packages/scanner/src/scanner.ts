// Keep Playwright browser binaries inside the project (node_modules) so the
// scanner never reads or writes outside the project directory. This is also set
// by the `cross-env PLAYWRIGHT_BROWSERS_PATH=0` npm scripts; the assignment here
// is a defensive default for direct programmatic use.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0';

import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type {
  Browser,
  BrowserContext,
  ConsoleMessage as PwConsoleMessage,
  Page,
  Request,
  Response,
} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {
  computeSummary,
  deriveScanStatus,
  groupIssues,
  parseReport,
  SCHEMA_VERSION,
  type AccessibilityFinding,
  type ConsoleMessage,
  type FailedRequest,
  type HttpError,
  type PageError,
  type SecurityFinding,
  type Screenshot,
  type Viewport,
  type ViewportResult,
  type VibeCheckReport,
} from '@vibecheck/report-schema';
import { createRunId, evaluateNetworkUrl, isSafeRunId, validateLocalUrl } from '@vibecheck/shared';
import {
  accessibilitySeverity,
  consoleSeverity,
  failedRequestSeverity,
  httpSeverity,
  isHttpError,
  normaliseConsoleLevel,
} from './classify.js';

export const VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

export type ScanErrorCode =
  | 'URL_NOT_ALLOWED'
  | 'INVALID_RUN_ID'
  | 'BROWSER_LAUNCH_FAILED'
  | 'REPORT_WRITE_FAILED'
  | 'REPORT_INVALID';

export class ScanError extends Error {
  constructor(
    public code: ScanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

export interface ScanOptions {
  /** Target URL (must pass the loopback safety gate). */
  url: string;
  /** Root directory that will receive a new <runId> subfolder. */
  outputRoot: string;
  /** Navigation timeout per viewport (ms). */
  navigationTimeoutMs?: number;
  /** Settle delay after load to capture late async events (ms). */
  settleMs?: number;
  /** Optional explicit run id (validated; defaults to a generated one). */
  runId?: string;
  /** Optional progress logger. */
  onProgress?: (message: string) => void;
}

export interface ScanResult {
  report: VibeCheckReport;
  reportDir: string;
  reportJsonPath: string;
}

interface Collectors {
  consoleMessages: ConsoleMessage[];
  pageErrors: PageError[];
  failedRequests: FailedRequest[];
  httpErrors: HttpError[];
  securityFindings: SecurityFinding[];
  /** URLs the egress policy already aborted, to avoid double-counting as failed requests. */
  blockedUrls: Set<string>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newCollectors(): Collectors {
  return {
    consoleMessages: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    securityFindings: [],
    blockedUrls: new Set(),
  };
}

/**
 * Install the loopback egress policy on a context BEFORE any navigation:
 * abort every request whose URL is not loopback http/https, block external
 * WebSockets, and record each block as a typed security finding.
 */
async function installEgressPolicy(
  context: BrowserContext,
  viewport: Viewport['name'],
  collectors: Collectors,
): Promise<void> {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const evaluation = evaluateNetworkUrl(url);
    try {
      if (evaluation.decision === 'block') {
        collectors.blockedUrls.add(url);
        collectors.securityFindings.push({
          category: 'security-policy',
          severity: 'critical',
          kind: 'blocked-request',
          message: `Blocked non-loopback request to ${evaluation.host ?? url}`,
          requestUrl: url,
          host: evaluation.host,
          resourceType: request.resourceType() ?? null,
          viewport,
          timestamp: nowIso(),
        });
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    } catch {
      // Route may already be handled if the page is closing; ignore.
    }
  });

  // Block external WebSocket connections where the installed Playwright version
  // exposes a controllable interface.
  const ctx = context as unknown as {
    routeWebSocket?: (
      url: RegExp,
      handler: (ws: { url(): string; connectToServer(): void; close(): void }) => void,
    ) => Promise<void>;
  };
  if (typeof ctx.routeWebSocket === 'function') {
    await ctx.routeWebSocket(/.*/, (ws) => {
      const url = ws.url();
      if (evaluateNetworkUrl(url).decision === 'allow') {
        ws.connectToServer();
      } else {
        collectors.securityFindings.push({
          category: 'security-policy',
          severity: 'critical',
          kind: 'blocked-websocket',
          message: `Blocked non-loopback WebSocket to ${url}`,
          requestUrl: url,
          host: evaluateNetworkUrl(url).host,
          resourceType: 'websocket',
          viewport,
          timestamp: nowIso(),
        });
        ws.close();
      }
    });
  }
}

function attachListeners(
  page: Page,
  viewport: Viewport['name'],
  collectors: Collectors,
  targetUrl: string,
): void {
  page.on('console', (msg: PwConsoleMessage) => {
    const level = normaliseConsoleLevel(msg.type());
    const loc = msg.location();
    const source = loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : null;
    collectors.consoleMessages.push({
      category: 'console',
      level,
      severity: consoleSeverity(level),
      message: msg.text(),
      source,
      viewport,
      url: targetUrl,
      timestamp: nowIso(),
    });
  });

  page.on('pageerror', (error: Error) => {
    collectors.pageErrors.push({
      category: 'page-error',
      severity: 'error',
      message: error.message,
      stack: error.stack ?? null,
      source: null,
      viewport,
      url: targetUrl,
      timestamp: nowIso(),
    });
  });

  page.on('requestfailed', (request: Request) => {
    // Requests we deliberately aborted via the egress policy are recorded as
    // security findings, not as ordinary failed requests.
    if (collectors.blockedUrls.has(request.url())) return;
    const failure = request.failure();
    collectors.failedRequests.push({
      category: 'failed-request',
      severity: failedRequestSeverity(),
      message: failure?.errorText ?? 'Request failed',
      requestUrl: request.url(),
      method: request.method(),
      resourceType: request.resourceType() ?? null,
      viewport,
      timestamp: nowIso(),
    });
  });

  page.on('response', (response: Response) => {
    const status = response.status();

    // A redirect (3xx) whose Location points off loopback is a policy escape.
    // The 3xx itself comes from an allowed (loopback) host, so it is always
    // observable here even if the redirected request is not interceptable.
    if (status >= 300 && status < 400) {
      const location = response.headers()['location'];
      if (location) {
        let absolute = location;
        try {
          absolute = new URL(location, response.url()).toString();
        } catch {
          /* keep raw location */
        }
        const evaluation = evaluateNetworkUrl(absolute);
        if (evaluation.decision === 'block') {
          collectors.blockedUrls.add(absolute);
          collectors.securityFindings.push({
            category: 'security-policy',
            severity: 'critical',
            kind: 'navigation-escape',
            message: `Blocked redirect off loopback to ${evaluation.host ?? absolute}`,
            requestUrl: absolute,
            host: evaluation.host,
            resourceType: 'document',
            viewport,
            timestamp: nowIso(),
          });
        }
      }
      return;
    }

    if (!isHttpError(status)) return;
    const request = response.request();
    collectors.httpErrors.push({
      category: 'http-error',
      severity: httpSeverity(status),
      message: `${status} ${response.statusText()} for ${response.url()}`,
      requestUrl: response.url(),
      status,
      statusText: response.statusText() || null,
      method: request.method(),
      resourceType: request.resourceType() ?? null,
      viewport,
      timestamp: nowIso(),
    });
  });
}

async function runAccessibility(
  page: Page,
  viewport: Viewport['name'],
): Promise<AccessibilityFinding[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const findings: AccessibilityFinding[] = [];
  for (const violation of results.violations) {
    findings.push({
      category: 'accessibility',
      severity: accessibilitySeverity(violation.impact),
      ruleId: violation.id,
      message: violation.help ?? violation.description,
      impact: (violation.impact as AccessibilityFinding['impact']) ?? null,
      helpUrl: violation.helpUrl ?? null,
      nodes: violation.nodes.slice(0, 5).map((node) => ({
        target: node.target.map((t) => String(t)),
        html: node.html ?? null,
      })),
      viewport,
      timestamp: nowIso(),
    });
  }
  return findings;
}

/**
 * Scan a single local URL across three viewports and produce a validated,
 * reproducible report plus screenshots. All artifacts are written to a
 * temporary directory and only renamed to reports/<runId>/ atomically once the
 * report has been validated, so a failure never leaves a half-written run.
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const {
    url,
    outputRoot,
    navigationTimeoutMs = 20_000,
    settleMs = 1_000,
    onProgress = () => {},
  } = options;

  const safety = validateLocalUrl(url);
  if (!safety.ok) {
    throw new ScanError('URL_NOT_ALLOWED', `${safety.reason} (${safety.code})`);
  }
  const targetUrl = safety.url;

  const runId = options.runId ?? createRunId();
  if (!isSafeRunId(runId)) {
    throw new ScanError('INVALID_RUN_ID', `Run id "${runId}" is not a safe path segment.`);
  }

  const finalDir = join(outputRoot, runId);
  const tempDir = join(outputRoot, `.tmp-${runId}`);
  const startedAt = new Date();

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    // Browser launch failed before any directory was created: nothing to clean.
    throw new ScanError(
      'BROWSER_LAUNCH_FAILED',
      `Could not launch Chromium. Did you run "npm run playwright:install"? Details: ${String(error)}`,
    );
  }

  try {
    await mkdir(tempDir, { recursive: true });
  } catch (error) {
    await browser.close();
    throw new ScanError(
      'REPORT_WRITE_FAILED',
      `Could not create temporary report directory "${tempDir}": ${String(error)}`,
    );
  }

  const collectors = newCollectors();
  const viewportResults: ViewportResult[] = [];
  const screenshots: Screenshot[] = [];
  let accessibilityFindings: AccessibilityFinding[] = [];
  let accessibilityRan = false;
  let finalUrl = targetUrl;

  try {
    const browserVersion = browser.version();

    for (const viewport of VIEWPORTS) {
      onProgress(`Scanning ${viewport.name} (${viewport.width}x${viewport.height})`);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });

      let ok = true;
      let viewportError: string | null = null;
      let title = '';
      let viewportFinalUrl = targetUrl;
      let screenshotPath: string | null = null;

      try {
        await installEgressPolicy(context, viewport.name, collectors);
        const page = await context.newPage();
        attachListeners(page, viewport.name, collectors, targetUrl);

        try {
          await page.goto(targetUrl, { waitUntil: 'load', timeout: navigationTimeoutMs });
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
          await page.waitForTimeout(settleMs);
          title = await page.title();

          // Re-validate the final main-frame URL after any redirects. Only a
          // loopback final URL is recorded as the result; an escaped URL is
          // reported as a security finding and never propagated into the report.
          const observedUrl = page.url();
          const finalEval = evaluateNetworkUrl(observedUrl);
          if (finalEval.decision === 'block') {
            ok = false;
            viewportError = `Navigation escaped loopback to ${observedUrl}`;
            collectors.securityFindings.push({
              category: 'security-policy',
              severity: 'critical',
              kind: 'navigation-escape',
              message: `Main-frame navigation escaped loopback to ${observedUrl}`,
              requestUrl: observedUrl,
              host: finalEval.host,
              resourceType: 'document',
              viewport: viewport.name,
              timestamp: nowIso(),
            });
          } else {
            viewportFinalUrl = observedUrl;
            finalUrl = observedUrl;
          }
        } catch (error) {
          ok = false;
          viewportError = `Navigation failed: ${String(error)}`;
        }

        const fileName = `${viewport.name}.png`;
        try {
          await page.screenshot({ path: join(tempDir, fileName), fullPage: true });
          screenshotPath = fileName;
          screenshots.push({
            viewport: viewport.name,
            path: fileName,
            width: viewport.width,
            height: viewport.height,
          });
        } catch (error) {
          ok = false;
          viewportError = [viewportError, `Screenshot failed: ${String(error)}`]
            .filter(Boolean)
            .join('; ');
        }

        // Run accessibility once, on the first viewport that loaded successfully.
        if (!accessibilityRan && ok) {
          try {
            accessibilityFindings = await runAccessibility(page, viewport.name);
            accessibilityRan = true;
          } catch {
            // Will retry on a later viewport; status stays partial until it succeeds.
          }
        }
      } finally {
        await context.close();
      }

      viewportResults.push({
        viewport,
        ok,
        title,
        finalUrl: viewportFinalUrl,
        screenshotPath,
        error: viewportError,
      });
    }

    const completedAt = new Date();
    const viewportsOk = viewportResults.filter((r) => r.ok).length;
    const scanStatus = deriveScanStatus({
      viewportsOk,
      viewportsTotal: VIEWPORTS.length,
      accessibilityRan,
      securityBlocks: collectors.securityFindings.length,
    });

    const summaryInput = {
      viewportResults,
      consoleMessages: collectors.consoleMessages,
      pageErrors: collectors.pageErrors,
      failedRequests: collectors.failedRequests,
      httpErrors: collectors.httpErrors,
      accessibilityFindings,
      securityFindings: collectors.securityFindings,
    };

    const report: VibeCheckReport = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      requestedUrl: targetUrl,
      finalUrl,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      scanStatus,
      browser: { name: 'chromium', version: browserVersion, engine: 'Blink' },
      viewportResults,
      screenshots,
      consoleMessages: collectors.consoleMessages,
      pageErrors: collectors.pageErrors,
      failedRequests: collectors.failedRequests,
      httpErrors: collectors.httpErrors,
      accessibilityFindings,
      securityFindings: collectors.securityFindings,
      issueGroups: groupIssues(summaryInput),
      summary: computeSummary(summaryInput),
    };

    const validation = parseReport(report);
    if (!validation.ok) {
      throw new ScanError(
        'REPORT_INVALID',
        `Generated report failed schema validation: ${validation.errors.join('; ')}`,
      );
    }

    // Write report.json to a temp name inside the temp dir, then finalize.
    const tempJson = join(tempDir, 'report.json.tmp');
    await writeFile(tempJson, JSON.stringify(report, null, 2), 'utf8');
    await rename(tempJson, join(tempDir, 'report.json'));

    // Atomically promote the temp run directory to its final run id.
    await rename(tempDir, finalDir);

    return {
      report: validation.report,
      reportDir: finalDir,
      reportJsonPath: join(finalDir, 'report.json'),
    };
  } catch (error) {
    // Never leave a publishable or half-written run directory behind.
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    if (error instanceof ScanError) throw error;
    throw new ScanError('REPORT_WRITE_FAILED', `Scan failed: ${String(error)}`);
  } finally {
    await browser.close();
  }
}
