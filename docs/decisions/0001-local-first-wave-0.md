# 0001 — Local-first for Wave 0

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

VibeCheck scans web prototypes in a real browser. Scanning arbitrary remote URLs
is powerful but carries real abuse potential (it can become a scanner of other
people's sites) and significant operational complexity (queues, sandboxing, rate
limiting, hosting browsers).

## Decision

Wave 0 is strictly **local-first**. It only scans the bundled demo fixture and
explicit **localhost** URLs (`localhost`, `127.0.0.1`, `::1`). All other hosts
are rejected by a single deterministic safety gate before any browser launches.

## Consequences

- The core value (real browser evidence, reproducible reports) is demonstrable
  in 24–48 h without building hosting or anti-abuse infrastructure.
- The project is safe to publish and run: it cannot be pointed at third parties.
- Remote/hosted scanning is deferred to a later wave with proper authorization,
  sandboxing and rate limiting.

## Update (fix wave 0.1)

The "local only" guarantee is now **enforced technically**, not just on the typed
URL: the scanner contains all browser egress (redirects, subresources, frames,
WebSockets, service workers) via the loopback allow-list and records violations.
See [0004-egress-containment.md](0004-egress-containment.md).
