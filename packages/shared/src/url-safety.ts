/**
 * URL safety gate for VibeCheck.
 *
 * The scanner may only ever touch the bundled local demo fixture or an
 * explicitly provided localhost URL. This module is the single, deterministic
 * place that decides whether a target URL is allowed. It is intentionally
 * strict: it allow-lists loopback hosts rather than trying to block "bad" hosts.
 */

/** Hosts the scanner is permitted to reach. Loopback only. */
export const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

/** Protocols the scanner is permitted to open. */
export const ALLOWED_PROTOCOLS = ['http:', 'https:'] as const;

export type UrlRejectionCode =
  | 'INVALID_URL'
  | 'EMBEDDED_CREDENTIALS'
  | 'UNSUPPORTED_PROTOCOL'
  | 'HOST_NOT_ALLOWED';

export type UrlSafetyResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; code: UrlRejectionCode; reason: string };

/** Remove surrounding brackets from an IPv6 hostname, e.g. "[::1]" -> "::1". */
function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return lower.slice(1, -1);
  }
  return lower;
}

/**
 * Validate a target URL against the loopback safety boundary.
 *
 * Rejects, in order: unparseable URLs, embedded credentials, non-http(s)
 * protocols (e.g. file:, data:), and any host that is not loopback.
 */
export function validateLocalUrl(input: string): UrlSafetyResult {
  const raw = (input ?? '').trim();
  if (raw.length === 0) {
    return { ok: false, code: 'INVALID_URL', reason: 'URL is empty.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      code: 'INVALID_URL',
      reason: `"${raw}" is not a valid absolute URL.`,
    };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return {
      ok: false,
      code: 'EMBEDDED_CREDENTIALS',
      reason: 'URLs with embedded credentials (user:pass@host) are not allowed.',
    };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol as (typeof ALLOWED_PROTOCOLS)[number])) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROTOCOL',
      reason: `Protocol "${parsed.protocol}" is not allowed. Allowed: ${ALLOWED_PROTOCOLS.join(', ')}.`,
    };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!ALLOWED_HOSTS.includes(hostname as (typeof ALLOWED_HOSTS)[number])) {
    return {
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      reason: `Host "${parsed.hostname}" is not allowed. VibeCheck only scans loopback hosts: ${ALLOWED_HOSTS.join(', ')}.`,
    };
  }

  return { ok: true, url: parsed.toString(), hostname };
}

/** Network protocols that actually reach a server and must be host-checked. */
const NETWORK_PROTOCOLS = ['http:', 'https:', 'ws:', 'wss:'] as const;

/**
 * Browser-internal schemes that never cause external network egress and may be
 * allowed for the scan context (e.g. the initial about:blank, inline data/blob
 * resources rendered from already-loaded content).
 */
const NON_EGRESS_SCHEMES = ['about:', 'data:', 'blob:'] as const;

export type NetworkDecision = 'allow' | 'block' | 'ignore';

export interface NetworkEvaluation {
  decision: NetworkDecision;
  protocol: string | null;
  host: string | null;
}

/**
 * Decide what the scanner should do with a browser request URL.
 *
 * - `allow`  : a loopback http/https/ws(s) request — let it proceed.
 * - `ignore` : a non-egress scheme (about:/data:/blob:) — no network, leave it.
 * - `block`  : anything else (external hosts, file:, unknown schemes, unparseable)
 *              — abort it and record a security/policy finding.
 *
 * This reuses the same loopback allow-list as {@link validateLocalUrl}, so the
 * allow-list is the single source of truth for the whole egress boundary.
 */
export function evaluateNetworkUrl(input: string): NetworkEvaluation {
  const raw = (input ?? '').trim();

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { decision: 'block', protocol: null, host: null };
  }

  const protocol = parsed.protocol;

  if (NON_EGRESS_SCHEMES.includes(protocol as (typeof NON_EGRESS_SCHEMES)[number])) {
    return { decision: 'ignore', protocol, host: null };
  }

  if (NETWORK_PROTOCOLS.includes(protocol as (typeof NETWORK_PROTOCOLS)[number])) {
    const host = normalizeHostname(parsed.hostname);
    const allowed = ALLOWED_HOSTS.includes(host as (typeof ALLOWED_HOSTS)[number]);
    return { decision: allowed ? 'allow' : 'block', protocol, host };
  }

  // file:, chrome:, and any other scheme: block by default.
  return { decision: 'block', protocol, host: null };
}

/** True only for http(s) URLs — used to gate clickable links in the viewer. */
export function isSafeHttpUrl(input: string): boolean {
  try {
    const parsed = new URL((input ?? '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
