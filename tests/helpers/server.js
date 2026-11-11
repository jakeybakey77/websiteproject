// Shared helpers for HTTP integration tests. Not a test file itself.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../server/app.mjs';
import { ISO_DEMO_IDENTITIES } from '../../public/js/data/iso-demo-identities.js';

export const CREDENTIALS = { username: 'reviewer', password: 'test-password-12345' };

export function testConfig(dir, overrides = {}) {
  return {
    port: 0, host: '127.0.0.1', production: false, demoMode: true, seedSampleLeads: true,
    dbPath: join(dir, 'test.sqlite'), adminUsername: CREDENTIALS.username, adminPassword: CREDENTIALS.password,
    sessionSecret: 'test-session-secret-at-least-32-characters', sessionTtlMs: 60 * 60 * 1000, cookieSecure: false,
    maxBodyBytes: 64 * 1024, ...overrides,
  };
}

/** Starts an app on a fresh temp database. `t.after` cleans up. Pass `dir` to reopen an existing database. */
export async function start(t, { dir = mkdtempSync(join(tmpdir(), 'gcp-iso-test-')), overrides = {}, cleanup = true } = {}) {
  const app = createApp({ config: testConfig(dir, overrides) });
  const address = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await app.close(); } };
  t.after(async () => { await close(); if (cleanup) rmSync(dir, { recursive: true, force: true }); });
  return { app, dir, base, close };
}

export async function login(base) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDENTIALS) });
  const body = await response.json();
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  const call = async (method, path, payload, { csrf = body.csrfToken, withCookie = true } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (withCookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${base}${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const textBody = await res.text();
    let parsed; try { parsed = JSON.parse(textBody); } catch { parsed = textBody; }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  return { cookie, csrfToken: body.csrfToken, get: (path) => call('GET', path), post: (path, payload = {}, options) => call('POST', path, payload, options), call };
}

export function isoApplication(index = 0, answers = {}) {
  return {
    identity: { ...ISO_DEMO_IDENTITIES[index] },
    answers: { relationshipType: 'iso', region: 'CT', specializations: ['working_capital', 'sba'], referralVolume: '6_20', yearsActive: '3_10y', demoAcknowledged: true, ...answers },
    source: 'linkedin', medium: 'social', campaign: 'partner-demo',
  };
}

export async function submitIsoApplication(base, payload = isoApplication()) {
  const res = await fetch(`${base}/api/iso/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: res.status, body: await res.json() };
}

export function merchantInquiry(identity) {
  return {
    identity,
    answers: { industry: 'retail', state: 'CT', timeInBusiness: '2_5y', monthlyRevenue: '50000', amountRequested: '25000', useOfFunds: 'inventory',
      useOfFundsDetail: 'Fictional seasonal inventory', hasExistingFinancing: 'no', existingFinancingTypes: [], demoAcknowledged: true },
    source: 'google', medium: 'cpc', campaign: 'demo',
  };
}

export const b64 = (value) => Buffer.from(value).toString('base64');
export const csvUpload = (text, filename = 'partners.csv', mapping) => ({ filename, contentBase64: b64(text), ...(mapping ? { mapping } : {}) });

export const SAMPLE_CSV = [
  'organization_name,legal_name,website,state,specializations,relationship_type,contact_name,contact_role,contact_email,contact_phone',
  'Sample Meadow Capital,Sample Meadow Capital LLC,https://sample-meadow-capital.example,CT,working_capital;sba,iso,Jamie Placeholder,Principal,jamie.placeholder@example.com,(203) 555-0181',
  'Demo Quarry Brokers,,demo-quarry-brokers.example,NY,equipment_finance,broker,Robin Sample,Broker,robin.sample@example.org,203-555-0182',
  '"Fictional Orchard Referrals, Inc.",,,NJ,,referral_partner,,,,',
].join('\r\n');
