# Contributing

VibeCheck is a personal portfolio project. Contributions, ideas and bug reports
are welcome.

## Prerequisites

- Node.js ≥ 20 (developed on Node 24)
- npm ≥ 10

## Setup

```bash
npm install
npm run playwright:install   # Chromium into project node_modules
```

## Development loop

```bash
npm run dev:fixture          # the deliberately flawed scan target
npm run dev:report           # view the committed curated report snapshot
npm run update:demo-snapshot # refresh the snapshot from a fresh scan
```

## Quality gates

Before opening a pull request, run:

```bash
npm run lint
npm run format:check
npm test                 # portable: uses project-local Chromium, no global cache
npm run build
npm run verify:demo-snapshot
```

## Conventions

- TypeScript everywhere, `strict` mode on.
- Findings must always come from **real, observed** browser data. Never fabricate
  or infer findings.
- Keep the loopback allow-list (`packages/shared/src/url-safety.ts`) as the single
  source of truth for both the initial URL and all per-request egress decisions.
- Counts must distinguish raw observations from unique issues.
- The report viewer must runtime-validate every report (`parseReport`) and never
  render unvalidated or unsafe data (e.g. non-http help links).
- Prefer small, well-tested modules over large ones.

## Demo fixture

`apps/demo-fixture` is a controlled test target with intentional, documented
defects (`docs/DEMO_FIXTURE_DEFECTS.md`). Do not "fix" them.

## Project structure

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
