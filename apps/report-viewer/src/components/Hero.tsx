import type { IssueCounts, VibeCheckReport } from '@vibecheck/report-schema';
import { formatDateTime, screenshotUrl } from '../report.js';
import { StatusBadge } from './StatusBadge.js';

const COUNTS: { key: keyof IssueCounts; label: string }[] = [
  { key: 'console', label: 'Console errors' },
  { key: 'pageErrors', label: 'Page errors' },
  { key: 'failedRequests', label: 'Failed requests' },
  { key: 'httpErrors', label: 'HTTP errors' },
  { key: 'accessibility', label: 'A11y findings' },
  { key: 'security', label: 'Security blocks' },
];

export function Hero({ report }: { report: VibeCheckReport }): JSX.Element {
  const { summary } = report;
  const totalUnique = Object.values(summary.uniqueIssues).reduce((a, b) => a + b, 0);
  const totalObservations = Object.values(summary.observations).reduce((a, b) => a + b, 0);

  return (
    <section className="hero" aria-label="Report overview">
      <div className="hero__head">
        <div>
          <p className="hero__eyebrow">VibeCheck: Automated Prototype Quality Lab</p>
          <h1 className="hero__pitch">
            Turn a web prototype into a reproducible visual quality report with real browser
            evidence.
          </h1>
          <dl className="hero__meta">
            <div>
              <dt>Scanned URL</dt>
              <dd>
                <code>{report.requestedUrl}</code>
              </dd>
            </div>
            <div>
              <dt>Scan time</dt>
              <dd>{formatDateTime(report.startedAt)}</dd>
            </div>
            <div>
              <dt>Scan status</dt>
              <dd>{report.scanStatus}</dd>
            </div>
          </dl>
        </div>
        <div className="hero__status">
          <StatusBadge status={summary.status} />
          <p className="hero__viewports">
            {summary.viewportsChecked}/{summary.viewportsTotal} viewports rendered
          </p>
        </div>
      </div>

      <form
        className="scanbar"
        aria-label="Scan a local prototype"
        onSubmit={(e) => e.preventDefault()}
      >
        <span className="scanbar__scheme">http://</span>
        <input
          className="scanbar__input"
          type="text"
          defaultValue="localhost:3000"
          disabled
          aria-disabled="true"
          aria-label="Local prototype URL"
        />
        <button className="scanbar__btn" type="button" disabled aria-disabled="true">
          Scan
        </button>
      </form>
      <p className="scanbar__note">
        The scanner runs on your machine, not here. Point it at a local prototype:{' '}
        <code>npm run scan http://localhost:3000</code>
      </p>

      <p className="hero__rollup">
        <strong>{totalUnique}</strong> unique issues · <strong>{totalObservations}</strong>{' '}
        observations across {summary.viewportsTotal} viewports
      </p>

      <ul className="counts">
        {COUNTS.map((item) => {
          const unique = summary.uniqueIssues[item.key];
          const observed = summary.observations[item.key];
          return (
            <li key={item.key} className={`count ${unique > 0 ? 'count--hot' : ''}`}>
              <span className="count__value">{unique}</span>
              <span className="count__label">{item.label}</span>
              <span className="count__sub">{observed} obs</span>
            </li>
          );
        })}
      </ul>

      <div className="hero__shots">
        {report.screenshots.map((shot) => {
          const src = screenshotUrl(shot.path);
          return (
            <figure key={shot.viewport} className="shot">
              {src ? (
                <img
                  className="shot__img"
                  src={src}
                  alt={`${shot.viewport} screenshot of ${report.requestedUrl}, ${shot.width}×${shot.height}`}
                  loading="lazy"
                />
              ) : (
                <div className="shot__img shot__img--missing">unsafe path</div>
              )}
              <figcaption className="shot__cap">
                {shot.viewport} · {shot.width}×{shot.height}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {summary.topIssues.length > 0 && (
        <div className="hero__issues">
          <span className="hero__issues-label">Top issues:</span>
          <ul>
            {summary.topIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
