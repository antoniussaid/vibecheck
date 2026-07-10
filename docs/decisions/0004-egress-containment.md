# 0004 — Loopback egress containment

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

Validating only the initial target URL is not enough: a local page can redirect
the browser off loopback, or load external scripts/images/fonts/fetches/frames/
WebSockets, or use a service worker. An independent review of the first
implementation showed the "loopback only" claim held only for the initial
navigation.

## Decision

Enforce the loopback allow-list for **all** browser activity, using
`evaluateNetworkUrl` (the same allow-list as `validateLocalUrl`) as the single
source of truth. Per viewport, before navigation:

- create the context with `serviceWorkers: 'block'`;
- `context.route('**/*', …)` aborts any non-loopback request and records a
  `security-policy` finding;
- `context.routeWebSocket(…)` blocks non-loopback WebSockets;
- a 3xx response whose `Location` leaves loopback is recorded as a
  `navigation-escape` (observed on the loopback response, so it is caught even
  when the redirected request is not interceptable);
- the final main-frame URL is re-validated; an escaped URL is recorded and never
  written into `finalUrl`.

Policy blocks are de-duplicated against ordinary failed requests, force
`scanStatus` away from `completed`, and set the summary to `fail`.

## Alternatives considered

- **Only re-validate the final URL:** misses subresources, frames and WebSockets.
- **Proxy/allow-list at the OS/network layer:** heavier and out of scope for a
  local-first tool.

## Consequences

- The "only localhost" guarantee is now technically enforced and regression-
  tested with local fixtures and the unresolvable `example.invalid` TLD (no
  external host is ever contacted).
- WebSocket containment depends on Playwright's `routeWebSocket`; documented as a
  limitation if a runtime lacks it.
