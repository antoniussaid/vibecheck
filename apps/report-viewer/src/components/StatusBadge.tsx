import type { SummaryStatus } from '@vibecheck/report-schema';
import { statusLabel } from '../report.js';

export function StatusBadge({ status }: { status: SummaryStatus }): JSX.Element {
  return (
    <span className={`status status--${status}`}>
      <span className="status__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
