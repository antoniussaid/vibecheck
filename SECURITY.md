# Security Policy

## Safety boundary

VibeCheck is a **local-first** tool. It scans only:

1. the bundled local demo fixture, and
2. explicitly provided **localhost** URLs.

### Allowed hosts

- `localhost`
- `127.0.0.1`
- `::1`

(any port). Alternative loopback notations (e.g. `127.1`, decimal/hex IPv4) are
accepted only because the WHATWG URL parser normalizes them to a loopback
address; they remain loopback.

### Egress containment (enforced, not just claimed)

The boundary is enforced for **all browser activity**, not only the URL you type.
Before each navigation the scanner:

- installs request interception on the browser context;
- blocks service workers (`serviceWorkers: 'block'`);
- aborts any request whose URL is not loopback http/https — scripts, styles,
  fonts, images, media, `fetch`/XHR, and frames;
- blocks non-loopback **WebSocket** connections;
- re-validates the final main-frame URL after redirects, and blocks redirects
  whose target leaves loopback.

Every blocked attempt is recorded as a typed **security finding** and forces the
scan status to `partial` or `failed` — it is never presented as a clean success.

### What VibeCheck does NOT do

- It does **not** scan arbitrary external websites.
- It does **not** scan private or internal network ranges.
- It does **not** perform load testing, fuzzing, or security scanning.
- It does **not** attempt to bypass authentication or access controls.
- It does **not** send data to any external service or AI API.
- It does **not** request or store API keys or secrets.

### Known limitations (honest)

- WebSocket containment relies on Playwright's `routeWebSocket`; if a future
  runtime lacks it, WS attempts are reported but the interface may differ.
- The bundled static server is for **trusted, project-local build output** only.
  It still hardens against traversal, malformed encodings and symlink/junction
  escape (realpath containment).

### Responsible use

Only scan applications you own or are explicitly authorized to test. VibeCheck is
a quality tool, not a penetration-testing tool.

## Reporting a vulnerability

This is a personal portfolio project. If you find a security issue, please open
an issue describing the problem and the steps to reproduce it.
