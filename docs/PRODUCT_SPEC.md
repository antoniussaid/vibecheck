# Product Spec — VibeCheck

## Pitch

Turn a web prototype into a reproducible visual quality report with real browser
evidence.

## Problem

People who build prototypes quickly (vibe coding, no-code, AI-assisted
frontends) ship demo links without knowing what really happens in a browser:
console errors, failed requests, broken mobile layout, inaccessible forms. These
problems surface at the worst possible moment — the live demo. Checking manually
is tedious and gets skipped.

## Target users

Solo builders, indie hackers, bootcamp students and small product/education
teams who repeatedly share prototype links and want fast, credible evidence of
quality.

## What makes it non-substitutable

A general chat assistant cannot open the page in a real browser, cannot read live
console output, cannot capture a 390 px screenshot, and cannot produce a
verifiable artifact. VibeCheck's value is **evidence**: the report only exists
because a real browser produced it.

## Current scope (implemented)

- Local-first scanning of the bundled demo fixture and explicit localhost URLs.
- Real Chromium sessions via Playwright across three viewports.
- Full-page screenshots per viewport.
- Console messages, page errors, failed requests, HTTP errors (≥ 400).
- Accessibility findings via axe-core.
- Versioned, schema-validated `report.json`.
- Deterministic summary with Pass / Needs attention / Fail.
- High-quality React report viewer.
- One-command reproducible demo scan.

## Out of scope (roadmap)

- Hosted / remote SaaS scanning and arbitrary external URLs
- Authentication, accounts, database, teams
- Persistent scan history
- AI-generated summaries
- Visual regression between two builds
- Lighthouse / performance budgets
- GitHub App, PR bot, GitHub Action
- PDF export
- Firefox / WebKit, mobile Safari
- Automated form interaction, multi-page broken-link crawling

## 10-second demo moment

Open the report viewer: a status pill (Fail), three device screenshots with real
content, the key finding counts, and the top issues — all above the fold.
