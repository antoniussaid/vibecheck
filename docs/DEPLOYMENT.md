# Deployment — VibeCheck Report Viewer (Cloudflare Workers)

VibeCheck's public live demo deploys **only the static report viewer** with the
committed curated demo snapshot. The scanner is **never** deployed: it runs
locally and only against loopback targets. The public site is a read-only,
backend-free, secret-free static page.

## Why only the viewer

- The scanner drives a real Chromium browser and must only touch local/loopback
  apps (see `docs/SECURITY_BOUNDARIES.md`). It is not safe or meaningful to run
  as a public service.
- The report viewer is a pure static Vite SPA that renders a `report.json` plus
  three screenshots. With the committed snapshot it needs no backend, no API, no
  database and no secrets.

## What stays local

`packages/scanner`, the demo fixture build/serve flow, `scan:demo`,
`update:demo-snapshot` and the Playwright browser — all local-only.

## Why Workers and not Pages

Cloudflare folded Pages into Workers; new projects created from the dashboard go
through the Workers build flow, which deploys with `wrangler` rather than a
Pages-specific pipeline. **Workers Static Assets** serves a directory of built
files straight from the edge. The `wrangler.jsonc` in the repository root
declares no `main` entry point on purpose: without one, no Worker code runs at
all and every request is answered from the uploaded assets.

## Build settings

| Setting           | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Production branch | `main`                                                               |
| Root directory    | `/` (repository root — the npm workspace)                            |
| Install command   | `npm ci` (Cloudflare's default for a lockfile)                       |
| Build command     | `npm run build:viewer`                                               |
| Deploy command    | `npx wrangler@4 deploy`                                              |
| Assets directory  | `apps/report-viewer/dist` (declared in `wrangler.jsonc`)             |
| Node version      | `22.23.1` (pinned via `.node-version`; satisfies Vite 8's `>=22.12`) |

The major version is pinned in the deploy command because `wrangler` is
deliberately **not** a devDependency: it is needed only at deploy time, on
Cloudflare's builder. Installing it would make every `npm ci` — local and CI —
download a toolchain that no test, lint or build step ever calls.

### Environment variables

| Variable                           | Value | Reason                                                                                                                                                                                           |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1`   | The root `npm ci` installs the `scanner` workspace's `playwright` dependency. The viewer build never needs a browser, so skip the (large) Chromium download to keep the build fast and reliable. |

No other environment variables and no secrets are required. The deploy needs a
Cloudflare API token, which the dashboard creates and stores for the project.

The build command builds only the viewer workspace (`vite build` for
`@vibecheck/report-viewer`), which inlines the report-schema validation and emits
a fully static `apps/report-viewer/dist/` containing `index.html`, `favicon.svg`,
`og-image.png`, hashed JS/CSS assets and `report/` (the curated `report.json` +
`desktop/tablet/mobile` screenshots, copied from `apps/report-viewer/public/`).

## Local reproduction

```bash
npm ci
npm run build:viewer
# validate the wrangler config and see exactly which files would be uploaded:
npx wrangler@4 deploy --dry-run
# serve the static output (any static server), e.g.:
npx --yes serve apps/report-viewer/dist
# open the printed URL
```

`vite.config.ts` uses `base: './'` and the viewer loads the report from the
relative path `./report/report.json`, so the build works at a domain root such
as a `*.workers.dev` URL with no extra rewrites.

## Deployment verification (what to check after deploy)

- `/` returns HTTP 200 and renders (no empty state).
- `/report/report.json` and `/report/{desktop,tablet,mobile}.png` return 200.
- JS/CSS assets and `/favicon.svg` return 200; no asset 404s; no console errors.
- Overall status **Fail** is shown; unique-issue and observation counts are
  visible; the accessibility section lists `label` and `image-alt`.
- A tampered/invalid `report.json` triggers the viewer's explicit error state
  ("This report could not be displayed.").

## SPA routing

The viewer is a single page using in-page hash anchors (`#overview`, `#console`,
…), so a root-domain reload returns 200 and no SPA fallback is required. If a
future version adds real path routes, set `assets.not_found_handling` to
`single-page-application` in `wrangler.jsonc`.

## The public address

The demo answers on **`vibecheck.antonius.app`**, declared as a `custom_domain`
route in `wrangler.jsonc`. Cloudflare creates the DNS record and issues the
certificate on deploy; nothing is clicked into the dashboard.

`workers_dev` is set to `false`, so the worker does not also answer on a
`*.workers.dev` address. Declaring a route already has that effect, but the
documentation only states that `workers_dev` defaults to `true` — the demo's
single public address should not rest on undocumented behaviour.

The Open Graph tags in `apps/report-viewer/index.html` carry absolute URLs, as
the protocol requires. If the demo ever moves, `og:url` and `og:image` move with
it.

## Updating the curated snapshot

The published demo is the committed snapshot under
`apps/report-viewer/public/report/`. To refresh it from a fresh scan:

```bash
npm run update:demo-snapshot   # rebuilds the fixture (production), scans it, writes + verifies the snapshot
npm run verify:demo-snapshot
npm run update:viewer-screenshot   # re-shoot the README image from the new snapshot
```

Commit the updated snapshot; the next build publishes it. A normal `scan:demo`
never touches the committed snapshot.

## Rollback

Each build is tied to a commit. To roll back, redeploy a previous successful
deployment (or push a revert). Because the demo is fully static and
snapshot-driven, a rollback simply restores the previous snapshot + viewer
bundle; there is no backend state to migrate.
