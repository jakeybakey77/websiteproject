import { extname, join, normalize, sep } from 'node:path';
import { readFile } from 'node:fs/promises';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
});

export function applyHeaders(res, extra = {}) {
  for (const [key, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) res.setHeader(key, value);
}

export function json(res, status, value, extra = {}) {
  applyHeaders(res, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.statusCode = status;
  res.end(JSON.stringify(value));
}

export function text(res, status, value, extra = {}) {
  applyHeaders(res, { 'Content-Type': 'text/plain; charset=utf-8', ...extra });
  res.statusCode = status;
  res.end(value);
}

export function redirect(res, location, status = 303) {
  applyHeaders(res, { Location: location, 'Cache-Control': 'no-store' });
  res.statusCode = status;
  res.end();
}

export async function readJson(req, maxBytes = 64 * 1024) {
  let size = 0;
  let tooLarge = false;
  const chunks = [];
  // Past the limit, stop buffering but keep reading (up to a hard cap) so the client
  // receives a clean 413 instead of a connection reset mid-upload.
  const drainCap = maxBytes + 8 * 1024 * 1024;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      tooLarge = true;
      chunks.length = 0;
      if (size > drainCap) { req.destroy(); break; }
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    const error = new Error('Request body too large.');
    error.statusCode = 413;
    throw error;
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export async function serveStatic(res, root, urlPath, { noStore = false } = {}) {
  let path = decodeURIComponent(urlPath);
  if (!path.endsWith('/') && !extname(path)) path += '/';
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    text(res, 403, 'Forbidden');
    return true;
  }
  try {
    const body = await readFile(file);
    applyHeaders(res, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      ...(noStore ? { 'Cache-Control': 'no-store' } : {}),
    });
    res.statusCode = 200;
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
