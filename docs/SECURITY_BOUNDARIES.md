# Security Boundaries — VibeCheck

## The single allow-list

All decisions use one loopback allow-list as the single source of truth
(`packages/shared/src/url-safety.ts`): `localhost`, `127.0.0.1`, `::1`.

- `validateLocalUrl(url)` gates the **initial** target URL (http/https only,
  no embedded credentials, loopback host).
- `evaluateNetworkUrl(url)` gates **every browser request** during the scan,
  returning `allow` (loopback http/https/ws/wss), `ignore` (non-egress schemes
  `about:`/`data:`/`blob:`) or `block` (everything else, incl. `file:`).

## Enforced egress containment

For each viewport, before navigation, the scanner (`packages/scanner/src/scanner.ts`):

1. creates the context with `serviceWorkers: 'block'`;
2. installs `context.route('**/*', …)` that aborts every `block` request and
   records a `security-policy` finding (`kind: 'blocked-request'`);
3. installs `context.routeWebSocket(…)` that blocks non-loopback WebSockets
   (`kind: 'blocked-websocket'`);
4. detects redirects whose `Location` leaves loopback and records
   `kind: 'navigation-escape'` (the 3xx is observed on the loopback response, so
   it is caught even if the redirected request is not interceptable);
5. re-validates the final main-frame URL; an escaped URL is recorded and never
   propagated into the report's `finalUrl`.

Aborted requests are de-duplicated so a policy block is **not** also counted as
an ordinary failed request. Any security finding forces `scanStatus` to
`partial`/`failed` and the summary to `fail`.

Covered by `packages/scanner/src/security.integration.test.ts` using only local
servers and the unresolvable `example.invalid` TLD — no external host is ever
actually contacted.

## Filesystem boundary

- Reports are written only under `reports/<runId>/`. The CLI exposes **no** free
  `--out` path. An explicit `runId` is strictly validated (`isSafeRunId`):
  ASCII letters/digits/`-`/`_`, length ≤ 80, no `..`, separators, drive letters
  or reserved names.
- Reports are produced atomically: artifacts are written to a temporary
  directory and only renamed to `reports/<runId>/` after the report validates.
  A failed browser launch or write leaves **no** publishable run directory.
- Screenshot references are validated to be relative and inside the report dir.
- The static server (`static-server.ts`) returns 400 on malformed
  percent-encoding, 404 on traversal (`..`, encoded, backslashes, drive
  letters), and enforces **realpath** containment to reject symlink/junction
  escape.
- Playwright browser binaries stay inside the project (`PLAYWRIGHT_BROWSERS_PATH=0`).

## Out of bounds

External/public hosts, private/LAN ranges, `file:`/unknown schemes, load or
security testing, auth bypass, external services or AI APIs, secrets.
