# Deployment — VibeCheck Report Viewer (Cloudflare Pages)

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

## Cloudflare Pages — exact build settings

| Setting                | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Production branch      | `main`                                                               |
| Root directory         | `/` (repository root — the npm workspace)                            |
| Framework preset       | None                                                                 |
| Install command        | `npm ci`                                                             |
| Build command          | `npm run build:viewer`                                               |
| Build output directory | `apps/report-viewer/dist`                                            |
| Node version           | `22.23.1` (pinned via `.node-version`; satisfies Vite 8's `>=22.12`) |

### Environment variables

| Variable                           | Value | Reason                                                                                                                                                                                           |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1`   | The root `npm ci` installs the `scanner` workspace's `playwright` dependency. The viewer build never needs a browser, so skip the (large) Chromium download to keep the build fast and reliable. |

No other environment variables and no secrets are required.

The build command builds only the viewer workspace (`vite build` for
`@vibecheck/report-viewer`), which inlines the report-schema validation and emits
a fully static `apps/report-viewer/dist/` containing `index.html`, hashed
JS/CSS assets and `report/` (the curated `report.json` + `desktop/tablet/mobile`
screenshots, copied from `apps/report-viewer/public/`).

## Local reproduction

```bash
npm ci
npm run build:viewer
# serve the static output (any static server), e.g.:
npx --yes serve apps/report-viewer/dist
# open the printed URL
```

`vite.config.ts` uses `base: './'` and the viewer loads the report from the
relative path `./report/report.json`, so the build works at a domain root such
as a `*.pages.dev` URL with no extra rewrites.

## Deployment verification (what to check after deploy)

- `/` returns HTTP 200 and renders (no empty state).
- `/report/report.json` and `/report/{desktop,tablet,mobile}.png` return 200.
- JS/CSS assets return 200; no asset 404s; no browser console errors.
- Overall status **Fail** is shown; unique-issue and observation counts are
  visible; the accessibility section lists `label` and `image-alt`.
- A tampered/invalid `report.json` triggers the viewer's explicit error state
  ("This report could not be displayed.").

(Verified locally via a static-server + Playwright deployment simulation; all
checks passed.)

## SPA routing

The viewer is a single page using in-page hash anchors (`#overview`, `#console`,
…), so a root-domain reload returns 200 and no SPA fallback / `_redirects` file
is required. If a future version adds real path routes, add a Cloudflare Pages
`public/_redirects` with `/* /index.html 200`.

## Later: custom domain

After the `*.pages.dev` deployment is confirmed working, a custom domain
`vibecheck.antonius.app` can be attached in Cloudflare Pages → Custom domains.
Until that exists, **no live-demo URL is published** in this repository.

## Updating the curated snapshot

The published demo is the committed snapshot under
`apps/report-viewer/public/report/`. To refresh it from a fresh scan:

```bash
npm run update:demo-snapshot   # rebuilds the fixture (production), scans it, writes + verifies the snapshot
npm run verify:demo-snapshot
```

Commit the updated snapshot; the next Pages build publishes it. A normal
`scan:demo` never touches the committed snapshot.

## Rollback

Each Cloudflare Pages build is tied to a commit. To roll back, redeploy a
previous successful deployment (or push a revert). Because the demo is fully
static and snapshot-driven, a rollback simply restores the previous snapshot +
viewer bundle; there is no backend state to migrate.
