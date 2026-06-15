import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Minimal static file server used to serve the built demo fixture and test
 * fixtures for local scanning and integration tests. It binds to loopback only
 * and is intended for trusted, project-local build output.
 *
 * Deterministic test hooks (loopback only):
 *   - GET /__vibecheck/dead            destroys the socket -> a failed request
 *   - GET /__vibecheck/redirect?to=URL responds 302 to URL (local or external)
 *   - any missing file                 returns 404         -> an HTTP error
 *   - malformed percent-encoding       returns 400 (no crash, no hang)
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface StaticServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/**
 * Serve `rootDir` over HTTP on 127.0.0.1. Pass port 0 for an ephemeral port.
 */
export async function serveDirectory(rootDir: string, port = 0): Promise<StaticServer> {
  // Resolve the real root once so symlink containment can be enforced per file.
  const resolved = resolve(rootDir);
  const realRoot = await realpath(resolved).catch(() => resolved);

  const server: Server = createServer((req, res) => {
    const requestUrl = req.url ?? '/';

    if (requestUrl.startsWith('/__vibecheck/dead')) {
      // Force a network-level failure for the fixture's failed-request demo.
      req.socket.destroy();
      return;
    }

    if (requestUrl.startsWith('/__vibecheck/redirect')) {
      const target = new URL(requestUrl, 'http://127.0.0.1').searchParams.get('to');
      if (target) {
        res.writeHead(302, { Location: target });
        res.end();
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
      }
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(requestUrl.split('?')[0]);
    } catch {
      // Malformed percent-encoding (e.g. "/%") must not crash or hang.
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    void serveFile(realRoot, pathname)
      .then((file) => {
        if (file) {
          res.writeHead(200, { 'Content-Type': file.contentType });
          createReadStream(file.absPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      });
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${boundPort}/`,
    port: boundPort,
    close: () =>
      new Promise<void>((resolvePromise) => {
        server.closeAllConnections?.();
        server.close(() => resolvePromise());
      }),
  };
}

async function serveFile(
  realRoot: string,
  pathname: string,
): Promise<{ absPath: string; contentType: string } | null> {
  let relative = pathname.replace(/^\/+/, '');
  if (relative === '') {
    relative = 'index.html';
  }

  // Lexical containment first (cheap reject for "..", absolute, drive letters).
  const candidate = normalize(join(realRoot, relative));
  if (candidate !== realRoot && !candidate.startsWith(realRoot + sep)) {
    return null;
  }

  const found = await resolveFile(realRoot, candidate);
  if (found) return found;

  // API-style routes never fall back; a missing one is a real 404.
  if (pathname.startsWith('/api')) {
    return null;
  }

  // SPA fallback: serve index.html for extension-less client routes.
  if (extname(relative) === '') {
    return resolveFile(realRoot, join(realRoot, 'index.html'));
  }
  return null;
}

async function resolveFile(
  realRoot: string,
  absPath: string,
): Promise<{ absPath: string; contentType: string } | null> {
  try {
    // realpath resolves symlinks/junctions; enforce containment on the REAL path
    // so a symlink inside the root cannot point outside it.
    const real = await realpath(absPath);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) {
      return null;
    }
    const info = await stat(real);
    if (!info.isFile()) return null;
    const contentType = MIME[extname(real).toLowerCase()] ?? 'application/octet-stream';
    return { absPath: real, contentType };
  } catch {
    return null;
  }
}
