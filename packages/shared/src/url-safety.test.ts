import { describe, expect, it } from 'vitest';
import { evaluateNetworkUrl, isSafeHttpUrl, validateLocalUrl } from './url-safety.js';

describe('validateLocalUrl', () => {
  it('accepts localhost', () => {
    const result = validateLocalUrl('http://localhost:4173');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostname).toBe('localhost');
    }
  });

  it('accepts 127.0.0.1', () => {
    const result = validateLocalUrl('http://127.0.0.1:4173/path');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostname).toBe('127.0.0.1');
    }
  });

  it('accepts ::1 (IPv6 loopback)', () => {
    const result = validateLocalUrl('http://[::1]:4173');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostname).toBe('::1');
    }
  });

  it('rejects a public external domain', () => {
    const result = validateLocalUrl('https://example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('HOST_NOT_ALLOWED');
    }
  });

  it('rejects a private network address', () => {
    const result = validateLocalUrl('http://192.168.1.10:8080');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('HOST_NOT_ALLOWED');
    }
  });

  it('rejects another private range (10.x)', () => {
    const result = validateLocalUrl('http://10.0.0.5');
    expect(result.ok).toBe(false);
  });

  it('rejects file: URLs', () => {
    const result = validateLocalUrl('file:///etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNSUPPORTED_PROTOCOL');
    }
  });

  it('rejects an invalid URL', () => {
    const result = validateLocalUrl('not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_URL');
    }
  });

  it('rejects an empty URL', () => {
    const result = validateLocalUrl('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_URL');
    }
  });

  it('rejects URLs with embedded credentials', () => {
    const result = validateLocalUrl('http://user:pass@localhost:4173');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EMBEDDED_CREDENTIALS');
    }
  });

  it('rejects credentials even when the host would be allowed', () => {
    const result = validateLocalUrl('http://admin@127.0.0.1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EMBEDDED_CREDENTIALS');
    }
  });
});

describe('evaluateNetworkUrl', () => {
  it('allows loopback http/https/ws/wss requests', () => {
    expect(evaluateNetworkUrl('http://localhost:4173/app.js').decision).toBe('allow');
    expect(evaluateNetworkUrl('https://127.0.0.1/x.css').decision).toBe('allow');
    expect(evaluateNetworkUrl('ws://localhost:4173/socket').decision).toBe('allow');
    expect(evaluateNetworkUrl('wss://[::1]/socket').decision).toBe('allow');
  });

  it('blocks external http/https requests', () => {
    expect(evaluateNetworkUrl('https://example.invalid/x.js').decision).toBe('block');
    expect(evaluateNetworkUrl('http://192.168.1.10/x.png').decision).toBe('block');
  });

  it('blocks external websockets', () => {
    expect(evaluateNetworkUrl('ws://example.invalid/socket').decision).toBe('block');
  });

  it('ignores non-egress schemes (about/data/blob)', () => {
    expect(evaluateNetworkUrl('about:blank').decision).toBe('ignore');
    expect(evaluateNetworkUrl('data:text/css,body{}').decision).toBe('ignore');
    expect(evaluateNetworkUrl('blob:http://localhost/abc').decision).toBe('ignore');
  });

  it('blocks file: and unknown schemes and unparseable input', () => {
    expect(evaluateNetworkUrl('file:///etc/passwd').decision).toBe('block');
    expect(evaluateNetworkUrl('chrome://settings').decision).toBe('block');
    expect(evaluateNetworkUrl('not a url').decision).toBe('block');
  });
});

describe('isSafeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeHttpUrl('https://dequeuniversity.com/rules/axe/4.10/label')).toBe(true);
    expect(isSafeHttpUrl('http://localhost/x')).toBe(true);
  });

  it('rejects javascript:, data:, file: and invalid urls', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('not a url')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});
