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
  generatedAdminPassword,
  generatedSessionSecret,
});
