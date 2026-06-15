import type { ReactNode } from 'react';
import type { Severity, VibeCheckReport } from '@vibecheck/report-schema';
import { formatDateTime, formatDuration, screenshotUrl } from '../report.js';
import { isSafeHelpUrl } from '../report-validation.js';

export function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <section id={id} className="section" aria-labelledby={`${id}-h`}>
      <div className="section__head">
        <h2 id={`${id}-h`}>{title}</h2>
        {typeof count === 'number' && <span className="section__count">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function SeverityTag({ severity }: { severity: Severity }): JSX.Element {
  return <span className={`sev sev--${severity}`}>{severity}</span>;
}

function EmptyState({ children }: { children: ReactNode }): JSX.Element {
  return <p className="empty">{children}</p>;
}

export function GallerySection({ report }: { report: VibeCheckReport }): JSX.Element {
  return (
    <Section id="viewports" title="Viewport gallery">
      <div className="gallery">
        {report.viewportResults.map((result) => {
          const src = result.screenshotPath ? screenshotUrl(result.screenshotPath) : null;
          return (
            <figure key={result.viewport.name} className="gallery__item">
              {src ? (
                <img
                  className="gallery__img"
                  src={src}
                  alt={`${result.viewport.name} rendering, ${result.viewport.width}×${result.viewport.height}`}
                  loading="lazy"
                />
              ) : (
                <div className="gallery__img gallery__img--missing">No screenshot</div>
              )}
              <figcaption>
                <strong>{result.viewport.name}</strong> · {result.viewport.width}×
                {result.viewport.height}
                <br />
                <span className="muted">
                  {result.ok ? result.title || 'Untitled' : 'Render failed'}
                </span>
                {result.error && <span className="gallery__err">{result.error}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </Section>
  );
}

export function ConsoleSection({ report }: { report: VibeCheckReport }): JSX.Element {
  const messages = report.consoleMessages;
  return (
    <Section
      id="console"
      title="Console & runtime"
      count={messages.length + report.pageErrors.length}
    >
      {report.pageErrors.length > 0 && (
        <div className="block">
          <h3 className="block__title">Uncaught page errors</h3>
          <ul className="list">
            {report.pageErrors.map((err, i) => (
              <li key={i} className="list__row">
                <SeverityTag severity={err.severity} />
                <div>
                  <p className="list__msg">{err.message}</p>
                  {err.stack && (
                    <pre className="code">{err.stack.split('\n').slice(0, 3).join('\n')}</pre>
                  )}
                  <p className="list__meta">viewport: {err.viewport}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="block">
        <h3 className="block__title">Console messages</h3>
        {messages.length === 0 ? (
          <EmptyState>No console messages were recorded.</EmptyState>
        ) : (
          <ul className="list">
            {messages.map((msg, i) => (
              <li key={i} className="list__row">
                <SeverityTag severity={msg.severity} />
                <div>
                  <p className="list__msg">{msg.message}</p>
                  <p className="list__meta">
                    level: {msg.level} · viewport: {msg.viewport}
                    {msg.source ? ` · ${msg.source}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

export function NetworkSection({ report }: { report: VibeCheckReport }): JSX.Element {
  const total = report.failedRequests.length + report.httpErrors.length;
  return (
    <Section id="network" title="Network" count={total}>
      {total === 0 ? (
        <EmptyState>No failed requests or HTTP errors were recorded.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Status</th>
              <th>Method</th>
              <th>URL</th>
              <th>Viewport</th>
            </tr>
          </thead>
          <tbody>
            {report.httpErrors.map((e, i) => (
              <tr key={`h${i}`}>
                <td>
                  <SeverityTag severity={e.severity} />
                </td>
                <td>HTTP</td>
                <td>{e.status}</td>
                <td>{e.method}</td>
                <td className="cell-url">{e.requestUrl}</td>
                <td>{e.viewport}</td>
              </tr>
            ))}
            {report.failedRequests.map((e, i) => (
              <tr key={`f${i}`}>
                <td>
                  <SeverityTag severity={e.severity} />
                </td>
                <td>Network</td>
                <td>{e.message}</td>
                <td>{e.method}</td>
                <td className="cell-url">{e.requestUrl}</td>
                <td>{e.viewport}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function AccessibilitySection({ report }: { report: VibeCheckReport }): JSX.Element {
  const findings = report.accessibilityFindings;
  return (
    <Section id="accessibility" title="Accessibility" count={findings.length}>
      {findings.length === 0 ? (
        <EmptyState>No accessibility violations were reported by axe-core.</EmptyState>
      ) : (
        <ul className="list">
          {findings.map((f, i) => (
            <li key={i} className="list__row">
              <SeverityTag severity={f.severity} />
              <div>
                <p className="list__msg">
                  <strong>{f.ruleId}</strong> — {f.message}
                </p>
                <p className="list__meta">
                  impact: {f.impact ?? 'n/a'} · viewport: {f.viewport} · {f.nodes.length} element(s)
                </p>
                {f.nodes[0]?.target?.length > 0 && (
                  <pre className="code">{f.nodes[0].target.join(' ')}</pre>
                )}
                {isSafeHelpUrl(f.helpUrl) && (
                  <a
                    className="list__link"
                    href={f.helpUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Rule reference
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function SecuritySection({ report }: { report: VibeCheckReport }): JSX.Element {
  const findings = report.securityFindings;
  return (
    <Section id="security" title="Security policy" count={findings.length}>
      {findings.length === 0 ? (
        <EmptyState>
          No egress policy violations — every request stayed on loopback (localhost, 127.0.0.1,
          ::1).
        </EmptyState>
      ) : (
        <ul className="list">
          {findings.map((f, i) => (
            <li key={i} className="list__row">
              <SeverityTag severity={f.severity} />
              <div>
                <p className="list__msg">{f.message}</p>
                <p className="list__meta">
                  kind: {f.kind} · host: {f.host ?? 'n/a'} · type: {f.resourceType ?? 'n/a'} ·
                  viewport: {f.viewport}
                </p>
                <pre className="code">{f.requestUrl}</pre>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function MetadataSection({ report }: { report: VibeCheckReport }): JSX.Element {
  const rows: [string, string][] = [
    ['Run ID', report.runId],
    ['Schema version', report.schemaVersion],
    ['Requested URL', report.requestedUrl],
    ['Final URL', report.finalUrl],
    ['Started', formatDateTime(report.startedAt)],
    ['Completed', formatDateTime(report.completedAt)],
    ['Duration', formatDuration(report.durationMs)],
    ['Browser', `${report.browser.name} ${report.browser.version} (${report.browser.engine})`],
    ['Scan status', report.scanStatus],
  ];
  return (
    <Section id="metadata" title="Run metadata">
      <dl className="meta-grid">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <code>{v}</code>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function MethodologySection(): JSX.Element {
  return (
    <Section id="methodology" title="Methodology">
      <div className="prose">
        <p>
          Every finding in this report is observed from a real Chromium session driven by
          Playwright. The page is loaded in three viewports (1440×900, 768×1024, 390×844). Console
          output, uncaught page errors, failed network requests and HTTP responses with status ≥ 400
          are captured as they occur. Accessibility findings come from axe-core run against the live
          DOM. No finding is generated or inferred by a model.
        </p>
        <p>
          The overall status is deterministic. <strong>Fail</strong> when there is any page error,
          console error, failed request, HTTP error, critical accessibility finding or blocked
          egress. <strong>Needs attention</strong> when there are non-blocking accessibility
          findings, console warnings or a viewport that failed to render. <strong>Pass</strong>{' '}
          otherwise. The same input always produces the same status — there is no opaque numeric
          score.
        </p>
        <p>
          Counts separate <strong>unique issues</strong> from raw <strong>observations</strong>: the
          same defect seen on three viewports is one issue with three observations, never three
          defects. A failed network request that the browser also logs to the console is shown in
          both the Network and Console sections but is the same underlying problem.
        </p>
        <p>
          The scanner enforces a loopback-only egress boundary: before navigation it intercepts all
          requests, blocks service workers, aborts any request or WebSocket to a non-loopback host,
          and re-validates the final URL after redirects. Blocked attempts appear as typed security
          findings and never as a clean success.
        </p>
      </div>
    </Section>
  );
}
