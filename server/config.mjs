import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

function loadDotEnv(path = resolve('.env')) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const bool = (name, fallback) => {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
};

const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
};

const production = process.env.NODE_ENV === 'production';
let adminPassword = process.env.ADMIN_PASSWORD || '';
let sessionSecret = process.env.SESSION_SECRET || '';
let generatedAdminPassword = false;
let generatedSessionSecret = false;

if (!adminPassword && !production) {
  adminPassword = randomBytes(12).toString('base64url');
  generatedAdminPassword = true;
}
if (!sessionSecret && !production) {
  sessionSecret = randomBytes(32).toString('base64url');
  generatedSessionSecret = true;
}

if (production && !adminPassword) {
  throw new Error('ADMIN_PASSWORD is required when NODE_ENV=production.');
}
if (production && !sessionSecret) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production.');
}
// Fail closed on weak or copied-from-the-example secrets in production.
if (production) {
  const placeholder = /replace-with|changeme|change-me|^password$|^admin$/i;
  if (adminPassword.length < 12 || placeholder.test(adminPassword)) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and must not be a placeholder when NODE_ENV=production.');
  }
  if (sessionSecret.length < 32 || placeholder.test(sessionSecret)) {
    throw new Error('SESSION_SECRET must be at least 32 random characters and must not be a placeholder when NODE_ENV=production.');
  }
}

/**
 * The only source for an absolute referral link. Must be a bare origin: https, or http on
 * a loopback host for local demos. Request headers (Host, X-Forwarded-Host) are never used.
 * Unset means referral links are returned as relative paths.
 */
export function parsePublicOrigin(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new Error('GCP_PUBLIC_ORIGIN must be an absolute origin such as https://demo.example.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('GCP_PUBLIC_ORIGIN must use https (http is allowed only for localhost).');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('GCP_PUBLIC_ORIGIN must be an origin only: no path, query, fragment or credentials.');
  return url.origin;
}

export const config = Object.freeze({
  port: int('PORT', 4173),
  host: process.env.HOST || '0.0.0.0',
  production,
  demoMode: bool('GCP_DEMO_MODE', true),
  seedSampleLeads: bool('SEED_SAMPLE_LEADS', true),
  dbPath: resolve(process.env.GCP_DB_PATH || 'data/gcp.sqlite'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword,
  sessionSecret,
  sessionTtlMs: int('SESSION_TTL_HOURS', 8) * 60 * 60 * 1000,
  cookieSecure: bool('COOKIE_SECURE', production),
  maxBodyBytes: int('MAX_BODY_BYTES', 64 * 1024),
  publicBaseUrl: parsePublicOrigin(process.env.GCP_PUBLIC_ORIGIN ?? process.env.PUBLIC_BASE_URL),
  generatedAdminPassword,
  generatedSessionSecret,
});
