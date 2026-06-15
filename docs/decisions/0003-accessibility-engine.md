# 0003 — Accessibility engine: axe-core via @axe-core/playwright

- **Status:** Accepted (clarified in fix wave 0.1)
- **Date:** 2026-06-14 (updated 2026-06-15)

## Context

Accessibility findings are a core, non-substitutable signal. We need an engine
that runs against the live DOM in the same Playwright session, produces real (not
inferred) findings, and integrates cleanly.

## Decision

Use **axe-core** through the official **`@axe-core/playwright`** integration
(`new AxeBuilder({ page }).analyze()`). Map axe violation `impact`
(critical/serious/moderate/minor) onto the VibeCheck severity model.

For Wave 0 the accessibility pass runs **once**, on the first viewport that loads
successfully, to keep finding counts meaningful. A later accessibility success
clears an earlier failure so the scan is not stuck on `partial`.

## Demo fixture alignment (fix wave 0.1)

The earlier demo claimed an axe `label` violation but produced `image-alt` +
`region`. Root cause: a `placeholder` provides Chromium an accessible name, which
**suppresses** axe's `label` rule; and content outside a landmark triggered
`region`. Fix: the fixture input now has no placeholder/label/aria/title (so
`label` fires) and the banner sits inside `<main>` (so `region` does not). The
demo now produces exactly `label` + `image-alt`, asserted by the integration
test.

## Alternatives considered

- **Lighthouse accessibility:** heavier, overlaps a roadmap "performance"
  feature, out of scope for Wave 0.
- **Hand-rolled checks:** far less credible and complete than axe-core.

## Consequences

- Findings are real, well-known axe rules with `helpUrl` references (rendered as
  clickable links only when http(s)).
- Per-viewport accessibility is deferred to a later wave.
- Two dependencies in the scanner: `axe-core` and `@axe-core/playwright`.
