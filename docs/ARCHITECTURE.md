# Architecture — VibeCheck

## Overview

VibeCheck is a TypeScript monorepo using npm workspaces. It separates
deterministic data collection from presentation, so every displayed finding is
traceable to real, observed browser data, and both the producer and the consumer
validate the report against the same schema.

```
            ┌──────────────────┐
            │  demo-fixture     │  deliberately flawed React site (scan target)
            └─────────┬────────┘
                      │ served on loopback (static-server, hardened)
                      ▼
┌──────────────────────────────────────────────────────────┐
│  scanner (Playwright + axe-core)                          │
│   1. validateLocalUrl + runId validation                  │
│   2. launch Chromium → temp run dir                       │
│   3. per viewport: install egress policy (route +         │
│      routeWebSocket + serviceWorkers:'block') BEFORE nav, │
│      load, re-validate final URL, screenshot              │
│   4. (once) run axe-core                                  │
│   5. classify + computeSummary + groupIssues              │
│   6. validate against zod schema                          │
│   7. atomic rename temp → reports/<runId>/                │
└─────────┬─────────────────────────────────────────────────┘
          │ report.json + screenshots
          ▼
┌──────────────────┐
│  report-viewer    │  React SPA: fetch → parseReport (runtime-validate) → render
└──────────────────┘
```

## Packages

- **`packages/shared`** — pure, dependency-free helpers: the loopback allow-list
  (`validateLocalUrl`, `evaluateNetworkUrl`, `isSafeHttpUrl`), run-id generation
  - validation (`isSafeRunId`), and report path-safety. The single source of
    truth for "is this URL allowed?".
- **`packages/report-schema`** — the versioned `zod` schema (the producer↔consumer
  contract), the deterministic summary engine, the issue-grouping engine, and
  `deriveScanStatus`. It re-exports the shared URL/path validators so the viewer
  can validate without a second direct dependency.
- **`packages/scanner`** — the Playwright-driven scanner, the egress policy, the
  axe-core integration, deterministic classifiers, a hardened loopback static
  server, the CLI, and committed test fixtures.

## Apps

- **`apps/demo-fixture`** — "VibeCheck Demo Shop", a controlled test target with
  documented, intentional defects (Vite + React).
- **`apps/report-viewer`** — a Vite + React SPA that fetches a published
  `report.json`, **runtime-validates it with `parseReport`**, and renders it.
  Invalid/tampered reports yield an explicit error state, never a partial render.
  External help links are gated to http(s) with `rel="noopener noreferrer"`; no
  `dangerouslySetInnerHTML`. The committed snapshot lives in
  `public/report/` so a fresh clone/build always shows a real report.

## Data-flow contract

The scanner is the only producer; the viewer is a pure consumer. They agree on
`@vibecheck/report-schema` and **both** run `parseReport`. A malformed report is
never produced (validated before atomic finalize) and never rendered (validated
before display).

## Determinism

The summary engine, grouping engine, `deriveScanStatus` and all classifiers are
pure functions. Identical findings yield byte-identical summaries and groups.
There is no opaque numeric score.

## Tooling

TypeScript (strict) · Vite · Playwright · axe-core · Vitest · ESLint · Prettier ·
own CSS with custom properties. No UI framework, no database, no AI SDK, no
external services. `npm test` is portable (`cross-env PLAYWRIGHT_BROWSERS_PATH=0`)
and uses the project-local Chromium. See `docs/decisions/` for rationale.
