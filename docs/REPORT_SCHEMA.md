# Report Schema — VibeCheck

The canonical definition lives in
[`packages/report-schema/src/schema.ts`](../packages/report-schema/src/schema.ts)
as a `zod` schema. This document describes it.

- **Schema version:** `1.1.0`
- **File:** `reports/<runId>/report.json`
- Validated against the schema before it is written (producer) **and** before it
  is rendered (the viewer runs `parseReport` and refuses invalid data).

## Top-level fields

| Field                       | Type                             | Notes                                                                |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `schemaVersion`             | `"1.1.0"`                        | Literal; bumped on breaking changes.                                 |
| `runId`                     | string                           | Unique, sortable, filesystem-safe.                                   |
| `requestedUrl`              | string                           | The validated target URL.                                            |
| `finalUrl`                  | string                           | Loopback URL after redirects (escaped URLs are never recorded here). |
| `startedAt` / `completedAt` | ISO-8601 datetime                | Scan start / end.                                                    |
| `durationMs`                | integer ≥ 0                      | Wall-clock duration.                                                 |
| `scanStatus`                | `completed`\|`partial`\|`failed` | Whether the run itself was complete.                                 |
| `browser`                   | `{ name, version, engine }`      | e.g. chromium / Blink.                                               |
| `viewportResults`           | `ViewportResult[]`               | One per viewport attempted.                                          |
| `screenshots`               | `Screenshot[]`                   | Relative paths inside the report dir.                                |
| `consoleMessages`           | `ConsoleMessage[]`               | Observed console output.                                             |
| `pageErrors`                | `PageError[]`                    | Uncaught runtime errors.                                             |
| `failedRequests`            | `FailedRequest[]`                | Network-level failures (policy blocks excluded).                     |
| `httpErrors`                | `HttpError[]`                    | Responses with status ≥ 400.                                         |
| `accessibilityFindings`     | `AccessibilityFinding[]`         | From axe-core.                                                       |
| `securityFindings`          | `SecurityFinding[]`              | Blocked egress / redirect / WebSocket.                               |
| `issueGroups`               | `IssueGroup[]`                   | Deterministic unique-issue grouping.                                 |
| `summary`                   | `ReportSummary`                  | Counts (raw + unique) + status.                                      |

## Severities

`info` · `warning` · `error` · `critical`

## SecurityFinding

`{ category: 'security-policy', severity, kind, message, requestUrl, host,
resourceType, viewport, timestamp }` where `kind` is `blocked-request`,
`blocked-websocket`, or `navigation-escape`.

## IssueGroup

`{ category, signature, severity, message, observations, viewports[], url,
source }`. `category` is one of `console`, `page-error`, `failed-request`,
`http-error`, `accessibility`, `security-policy`. Grouping is deterministic
(stable signature per category); `observations` is how many raw events the group
represents and `viewports` lists where it appeared.

## ReportSummary

`{ viewportsChecked, viewportsTotal, observations, uniqueIssues, status,
topIssues }`. Both `observations` and `uniqueIssues` are `IssueCounts`:
`{ console, pageErrors, failedRequests, httpErrors, accessibility, security }`.
`status` is `pass` / `needs-attention` / `fail`. No opaque numeric score.

## Screenshot path safety

`screenshots[].path` and `viewportResults[].screenshotPath` must be relative and
inside the report directory. The schema rejects absolute paths, drive letters,
backslashes and `..` traversal — enforced on both the producer and consumer side.

## No fabricated findings

Every finding originates from a real browser observation. Nothing is
AI-generated.
