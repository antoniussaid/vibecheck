import { symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveDirectory, type StaticServer } from './static-server.js';

const here = dirname(fileURLToPath(import.meta.url));
const cleanFixture = resolve(here, '../test-fixtures/clean');
const repoRoot = resolve(here, '../../..');

let server: StaticServer;

beforeAll(async () => {
  server = await serveDirectory(cleanFixture);
}, 30_000);

afterAll(async () => {
  await server?.close();
});

async function get(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(server.url.replace(/\/$/, '') + path);
  return { status: res.status, body: await res.text() };
}

describe('static server', () => {
  it('serves a normal file', async () => {
    const res = await get('/index.html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Clean local page');
  });

  it('serves the SPA fallback for an extension-less route', async () => {
    const res = await get('/some/client/route');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Clean local page');
  });

  it('returns 404 for a missing /api route (no SPA fallback)', async () => {
    const res = await get('/api/missing');
    expect(res.status).toBe(404);
  });

  it('blocks encoded ../ traversal', async () => {
    const res = await get('/%2e%2e%2f%2e%2e%2fpackage.json');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('vibecheck');
  });

  it('blocks encoded backslash traversal', async () => {
    const res = await get('/%2e%2e%5c%2e%2e%5cpackage.json');
    expect(res.status).toBe(404);
  });

  it('blocks an absolute / drive-letter path', async () => {
    const res = await get('/C:%5cWindows%5cwin.ini');
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed percent-encoding without crashing or hanging', async () => {
    const res = await get('/%');
    expect(res.status).toBe(400);
    expect(res.body).toBe('Bad Request');
  });

  it('does not leak local paths in error bodies', async () => {
    const notFound = await get('/definitely-missing.css');
    expect(notFound.status).toBe(404);
    expect(notFound.body).toBe('Not Found');
  });

  it('rejects a symlink/junction that escapes the served root', async () => {
    // Create a junction inside the served root pointing outside it.
    const link = join(cleanFixture, 'escape-link');
    let created = false;
    try {
      await symlink(repoRoot, link, 'junction');
      created = true;
    } catch {
      // Insufficient privileges to create a link on this machine: cannot test.
    }
    if (!created) {
      expect(true).toBe(true);
      return;
    }
    try {
      const res = await get('/escape-link/package.json');
      expect(res.status).toBe(404);
    } finally {
      await import('node:fs/promises').then((fs) => fs.rm(link, { recursive: true, force: true }));
    }
  });
});
