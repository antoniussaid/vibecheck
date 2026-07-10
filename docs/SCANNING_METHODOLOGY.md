# Scanning Methodology — VibeCheck

## How a scan runs

1. **Initial gate.** The target URL is validated (`validateLocalUrl`). Only
   loopback http/https passes. No browser launches for a rejected URL. An
   explicit `runId` (if provided) is strictly validated.
2. **Launch.** Headless Chromium via Playwright; browser binary inside the
   project (`PLAYWRIGHT_BROWSERS_PATH=0`). Artifacts are written to a temporary
   run directory.
3. **Per viewport** (desktop 1440×900, tablet 768×1024, mobile 390×844), in a
   fresh context with `serviceWorkers: 'block'`:
   - install the **egress policy** (request + WebSocket interception) _before_
     navigation;
   - attach listeners for `console`, `pageerror`, `requestfailed`, `response`;
   - navigate (`waitUntil: 'load'`), wait for network idle (best-effort, bounded)
     and a short settle delay;
   - re-validate the final URL; capture a full-page **screenshot**.
4. **Accessibility** runs **once**, on the first viewport that loads, via
   axe-core against the live DOM. (Per-viewport a11y is roadmap.)
5. **Classification** maps raw observations to schema findings with deterministic
   severities.
6. **Summary + grouping** compute raw observations, unique issues and status.
7. **Validate + finalize.** The report is validated against the zod schema, then
   the temp directory is renamed atomically to `reports/<runId>/`.

## Signals and severities

| Signal          | Source                               | Severity rule                                                  |
| --------------- | ------------------------------------ | -------------------------------------------------------------- |
| Console message | `console` event                      | error→error, warning→warning, else info                        |
| Page error      | `pageerror` event                    | error                                                          |
| Failed request  | `requestfailed` (not policy-blocked) | error                                                          |
| HTTP error      | `response` status ≥ 400              | ≥ 500 → critical, else error                                   |
| Accessibility   | axe-core impact                      | critical→critical, serious→error, moderate→warning, minor→info |
| Security/policy | blocked egress / escape              | critical                                                       |

## Unique issues vs raw observations

Counts separate **observations** (every event, including the same defect on three
viewports) from **unique issues** (deterministic grouping by a stable signature
per category). The same console error on three viewports is **1 unique issue with
3 observations**, never 3 defects. A failed network request that the browser also
logs to the console appears in both Network and Console but is one underlying
problem — the viewer states this explicitly.

## Overall status (deterministic)

1. **Fail** — any page error, console error, failed request, HTTP error,
   critical accessibility finding, **or blocked-egress security finding**.
2. **Needs attention** — else any accessibility finding, console warning, or a
   viewport that failed to render.
3. **Pass** — otherwise.

No opaque numeric score. Same input → same status (tested).

## Scan completeness (`scanStatus`)

Derived from explicit flags (`deriveScanStatus`):

- `completed` — all viewports rendered, accessibility ran, **no** egress blocks.
- `partial` — some viewport failed, accessibility never ran, or ≥ 1 egress block
  occurred (the page could not be observed exactly as authored). A later
  accessibility success clears an earlier failure (no sticky partial).
- `failed` — no viewport rendered.

A security policy block never yields a misleading `completed`.
