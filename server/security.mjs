import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { hashSessionToken } from './db.mjs';

const COOKIE_NAME = 'gcp_session';

export function passwordMatches(input, expected, salt) {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;
  const a = scryptSync(input, salt, 64);
  const b = scryptSync(expected, salt, 64);
  return timingSafeEqual(a, b);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function issueSession(db, { username, ttlMs }) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const now = Date.now();
  db.createSession({
    tokenHash: hashSessionToken(token),
    username,
    csrfToken,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
  return { token, csrfToken, expiresAt: now + ttlMs };
}

export function getSessionFromRequest(db, req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token) return null;
  return db.getSession(hashSessionToken(token));
}

export function destroySession(db, req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (token) db.deleteSession(hashSessionToken(token));
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = 28800 } = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie('', { secure, maxAgeSeconds: 0 });
}

export function verifyCsrf(req, session) {
  const supplied = req.headers['x-csrf-token'];
  return typeof supplied === 'string' && supplied.length > 0 && supplied === session?.csrfToken;
}
