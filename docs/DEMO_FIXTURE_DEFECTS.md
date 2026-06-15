# Demo Fixture Defects — "VibeCheck Demo Shop"

The demo fixture (`apps/demo-fixture`) is **not** a portfolio app. It is a
controlled scan target containing deliberate, documented defects so VibeCheck has
real evidence to capture. **Do not "fix" these defects** — they are the test
data, asserted exactly by the integration test.

| #   | Defect                                                                               | Where (source)                              | Expected VibeCheck signal                                       |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| 1   | Fixed-width banner (760px) inside `<main>`                                           | `src/App.tsx` `.wide-banner` / `styles.css` | Horizontal overflow in the mobile (390px) screenshot            |
| 2   | Deliberate `console.error` on mount                                                  | `src/App.tsx` `useEffect`                   | Console message, level `error` (text "simulated runtime error") |
| 3a  | Request to a missing endpoint `/api/products`                                        | `src/App.tsx` `useEffect`                   | HTTP error, status 404                                          |
| 3b  | Request to `/__vibecheck/dead` (server resets socket)                                | `src/App.tsx` + `static-server.ts`          | Network-level failed request                                    |
| 4   | Email `<input>` with **no label, no `aria-label`, no `title`, and no `placeholder`** | `src/App.tsx` newsletter form               | axe-core **`label`** violation                                  |
| 5   | `<img>` with no `alt` attribute                                                      | `src/App.tsx` product card                  | axe-core **`image-alt`** violation                              |
| 6   | Uncaught error thrown in `setTimeout`                                                | `src/App.tsx` `useEffect`                   | Uncaught page error (text "simulated uncaught error")           |

## Why the input has no placeholder

A `placeholder` gives Chromium an accessible name (via the accessible-name
computation), which **suppresses** the axe `label` rule. To reliably trigger
`label`, the input has no placeholder and no other naming mechanism.

## Why the banner is inside `<main>`

All page content sits inside landmarks (`<header>`, `<main>`, `<footer>`), so axe
does not raise a generic `region` finding. The accessibility findings are exactly
`label` and `image-alt` — nothing spurious.

## Expected outcome (curated snapshot)

- `scanStatus`: `completed`; summary status: **Fail**.
- Observations: 9 console errors, 3 page errors, 3 failed requests, 3 HTTP errors
  (each seeded defect repeated across 3 viewports); 2 accessibility findings.
- Unique issues: 3 console, 1 page error, 1 failed request, 1 HTTP error, 2
  accessibility (`label`, `image-alt`), 0 security blocks.
- The 6 "Failed to load resource" console errors are the **same** failures shown
  under Network — the same problem in two channels, not extra defects.

## Notes

- The demo loads only loopback resources, so it produces **no** security
  findings (egress containment is exercised separately by the security tests).
- The integration test (`packages/scanner/src/scanner.integration.test.ts`)
  asserts these exact signatures, not just `>= 1`.
