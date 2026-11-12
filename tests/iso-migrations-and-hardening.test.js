// Schema migration, database-level invariants, runtime hardening and the
// separation between partner scoring and the merchant workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { MIGRATIONS, runMigrations } from '../server/migrations.mjs';
import { DEMO_IDENTITIES } from '../public/js/data/demo-identities.js';
import { login, merchantInquiry, start, submitIsoApplication } from './helpers/server.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tempDir = (t) => { const dir = mkdtempSync(join(tmpdir(), 'gcp-mig-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('a v2.0 database upgrades in place: merchant data kept, ISO tables added, migrations recorded once', (t) => {
  const path = join(tempDir(t), 'legacy.sqlite');
  // Build the database exactly as v2.0 left it: baseline tables, no schema_migrations.
  const legacy = new DatabaseSync(path);
  legacy.exec(MIGRATIONS[0].sql);
  legacy.prepare(`INSERT INTO leads(id,demo,contact_name,business_name,email,phone,industry,state,time_in_business,use_of_funds,has_existing_financing,stage,received_at,created_at,updated_at)
    VALUES('DEMO-LEGACY-1',1,'Riley Sample','Example Street Bakery','riley.sample@example.com','(203) 555-0101','retail','CT','2_5y','inventory','no','in_review','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run();
  legacy.prepare("INSERT INTO audit_log(actor,action,lead_id,detail_json,at) VALUES('reviewer','review_saved','DEMO-LEGACY-1','{}','2026-10-02T00:00:00.000Z')").run();
  assert.equal(legacy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'schema_migrations'").get().n, 0);
  legacy.close();

  const db = openDatabase(path, { seed: true });
  assert.equal(db.schemaVersion(), 3);
  assert.equal(db.listLeads().length, 1, 'existing leads are kept and the sample seed does not run over them');
  assert.equal(db.getLead('DEMO-LEGACY-1').stage, 'in_review');
  const audit = db.listAudit();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].isoOrganizationId, null);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'iso_%' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(tables, ['iso_activity', 'iso_contacts', 'iso_evidence', 'iso_import_batches', 'iso_import_rows', 'iso_organizations', 'iso_referral_codes', 'iso_score_snapshots']);
  assert.deepEqual(db.raw.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((r) => [Number(r.version), r.name]),
    [[1, 'baseline_merchant_leads_sessions_audit'], [2, 'iso_partner_intelligence'], [3, 'iso_referral_tracking']]);
  db.close();

  // Reopening applies nothing new.
  const raw = new DatabaseSync(path);
  assert.deepEqual(runMigrations(raw), []);
  raw.close();
});

test('a failed migration rolls back and a newer-than-known schema refuses to start', (t) => {
  const path = join(tempDir(t), 'm.sqlite');
  const raw = new DatabaseSync(path);
  runMigrations(raw);
  const broken = [...MIGRATIONS, { version: 4, name: 'broken', sql: 'CREATE TABLE half_done (id INTEGER); CREATE TABLE iso_organizations (id TEXT);' }];
  assert.throws(() => runMigrations(raw, broken), /Migration 4 \(broken\) failed and was rolled back/);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'half_done'").get().n, 0);
  assert.equal(Number(raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v), 3);
  raw.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(99,'from_the_future','2027-01-01')").run();
  assert.throws(() => runMigrations(raw), /newer than this application/);
  raw.close();
});

test('database constraints hold even if application code is bypassed', (t) => {
  const db = openDatabase(join(tempDir(t), 'c.sqlite'));
  const raw = db.raw;
  const insertOrg = (overrides = {}) => {
    const row = { id: `ISO-${Math.random().toString(36).slice(2)}`, demo: 1, stage: 'imported', verification: 'unverified', tier: null, source: 'csv_import', ...overrides };
    return raw.prepare(`INSERT INTO iso_organizations(id,demo,display_name,name_key,acquisition_source,stage,verification_status,tier,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'2026-11-11','2026-11-11')`).run(row.id, row.demo, 'Sample Org', 'sample org', row.source, row.stage, row.verification, row.tier);
  };
  insertOrg({ id: 'ISO-OK' });
  assert.throws(() => insertOrg({ demo: 0 }), /CHECK constraint/, 'a non-demo partner record cannot be stored');
  assert.throws(() => insertOrg({ stage: 'funded' }), /CHECK constraint/);
  assert.throws(() => insertOrg({ stage: 'outreach_ready', verification: 'unverified' }), /CHECK constraint/, 'outreach-ready requires verified status at the schema level');
  assert.throws(() => insertOrg({ tier: 'S' }), /CHECK constraint/);
  assert.throws(() => insertOrg({ source: 'web_scrape' }), /CHECK constraint/, 'no scraping source exists');
  assert.throws(() => raw.prepare("UPDATE iso_organizations SET demo = 0 WHERE id = 'ISO-OK'").run(), /CHECK constraint/);
  assert.throws(() => raw.prepare("INSERT INTO iso_contacts(organization_id,created_by,created_at,updated_at) VALUES('ISO-NOPE','x','x','x')").run(), /FOREIGN KEY|CHECK constraint/);
  assert.throws(() => raw.prepare("INSERT INTO iso_evidence(organization_id,category,source_type,claim,status,created_by,created_at) VALUES('ISO-OK','business_identity','registry','claim','confirmed','x','x')").run(),
    /CHECK constraint/, 'confirmed evidence must name its reviewer');
  // Score history is append-only.
  raw.prepare(`INSERT INTO iso_score_snapshots(organization_id,kind,rules_version,score,tier,effective_tier,factors_json,inputs_digest,as_of,actor,assessed_at)
    VALUES('ISO-OK','computed','v',10,'D','D','[]','d','2026-11-11','system','2026-11-11')`).run();
  assert.throws(() => raw.prepare('UPDATE iso_score_snapshots SET score = 99').run(), /append-only/);
  assert.throws(() => raw.prepare('DELETE FROM iso_score_snapshots').run(), /append-only/);
  assert.throws(() => raw.prepare(`INSERT INTO iso_score_snapshots(organization_id,kind,rules_version,score,tier,effective_tier,factors_json,inputs_digest,as_of,actor,assessed_at)
    VALUES('ISO-OK','override','v',10,'D','A','[]','d','2026-11-11','x','x')`).run(), /CHECK constraint/, 'an override without a justification cannot be stored');
  // No column or key links partner records to merchant leads.
  const isoSql = raw.prepare("SELECT group_concat(sql, ' ') AS s FROM sqlite_master WHERE name LIKE 'iso_%'").get().s;
  assert.doesNotMatch(isoSql, /REFERENCES\s+leads|lead_id/i);
  const leadColumns = raw.prepare('PRAGMA table_info(leads)').all().map((c) => c.name);
  assert.ok(!leadColumns.some((name) => /iso|tier|score/i.test(name)), 'merchant leads have no partner score or tier column');
  db.close();
});

test('merchant screening code cannot see partner scores (module isolation)', () => {
  const merchantModules = ['server/inquiry.mjs', 'public/js/lib/validation-engine.js', 'public/js/lib/review-workflow.js', 'public/js/lib/lead-insights.js', 'public/js/lib/lead-stats.js',
    'public/js/lib/field-validators.js', 'public/js/config/validation-rules.js', 'public/js/config/pipeline.js', 'public/js/pages/apply.js', 'public/js/pages/dashboard.js', 'public/js/services/lead-service.js'];
  for (const file of merchantModules) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(source, /iso-scoring|iso-store|iso-pipeline|iso_score|computeIsoScore|iso_organizations/, `${file} must not reference ISO scoring`);
  }
  // And the scoring module reads nothing from the merchant side.
  const scoring = readFileSync(join(root, 'server/iso-scoring.mjs'), 'utf8');
  assert.deepEqual([...scoring.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['node:crypto']);
  const store = readFileSync(join(root, 'server/iso-store.mjs'), 'utf8');
  assert.doesNotMatch(store, /\b(FROM|INTO|UPDATE|JOIN)\s+leads\b/i, 'the ISO store never touches the leads table');
});

test('no outbound network, mail or scraping code exists in the server', () => {
  for (const file of readdirSync(join(root, 'server'))) {
    const source = readFileSync(join(root, 'server', file), 'utf8');
    assert.doesNotMatch(source, /\bfetch\(|node:https|node:net|node:dgram|node:tls|nodemailer|smtp|child_process|http\.request|https\.request/i, file);
  }
});

test('merchant leads are untouched by partner activity, and the old review workflow still works', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const created = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merchantInquiry(DEMO_IDENTITIES[2])) });
  const lead = await created.json();
  const snapshot = async () => JSON.stringify((await admin.get('/api/admin/leads')).body.leads);
  const before = await snapshot();

  const id = (await submitIsoApplication(base)).body.reference;
  await admin.post(`/api/admin/iso/organizations/${id}/stage`, { stage: 'research_needed' });
  await admin.post(`/api/admin/iso/organizations/${id}/score/override`, { tier: 'A', justification: 'Fictional override for the isolation test.' });
  await admin.post(`/api/admin/iso/organizations/${id}/stage`, { stage: 'disqualified', reason: 'out_of_scope', note: 'Fictional disqualification for the test.' });
  assert.equal(await snapshot(), before, 'no merchant lead, validation result or stage changed');

  const review = await admin.post(`/api/admin/leads/${lead.id}/review`, { stage: 'in_review', note: 'Fictional review note' });
  assert.equal(review.status, 200);
  assert.equal(review.body.lead.stage, 'in_review');
  assert.ok(review.body.lead.validation.status);
  assert.equal((await admin.post(`/api/admin/leads/${lead.id}/review`, { stage: 'handed_off' })).status, 422);
  assert.equal((await admin.post(`/api/admin/leads/${lead.id}/review`, { stage: 'ready_for_handoff' }, { csrf: null })).status, 403);
  // An ISO id is not a lead id and vice versa.
  assert.equal((await admin.post(`/api/admin/leads/${id}/review`, { stage: 'in_review' })).status, 404);
  assert.equal((await admin.get(`/api/admin/iso/organizations/${lead.id}`)).status, 404);
});

test('malformed request URLs get a 400 and do not take the server down', async (t) => {
  const { base } = await start(t);
  const rawGet = (path) => new Promise((resolve, reject) => {
    const url = new URL(base);
    const req = request({ host: url.hostname, port: url.port, path, method: 'GET' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(await rawGet('/%E0%A4%A'), 400);
  assert.equal(await rawGet('/api/admin/iso/organizations/%'), 400);
  assert.equal(await rawGet('/%'), 400);
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, demoMode: true });
  // Path traversal out of the public root is still refused.
  assert.notEqual(await rawGet('/..%2f..%2fserver%2fconfig.mjs'), 200);
  assert.notEqual(await rawGet('/%2e%2e/%2e%2e/package.json'), 200);
});

test('close() finishes promptly even with an idle keep-alive connection open', async (t) => {
  const { base, close } = await start(t);
  const url = new URL(base);
  const { Agent } = await import('node:http');
  const agent = new Agent({ keepAlive: true });
  t.after(() => agent.destroy());
  await new Promise((resolve, reject) => {
    request({ host: url.hostname, port: url.port, path: '/healthz', agent }, (res) => { res.resume(); res.on('end', resolve); }).on('error', reject).end();
  });
  const started = Date.now();
  await close();
  assert.ok(Date.now() - started < 2000, `close took ${Date.now() - started} ms`);
});

test('production start-up fails closed on missing, weak or placeholder secrets', () => {
  // Run from an empty directory so no local .env file can supply values.
  const tempCwd = mkdtempSync(join(tmpdir(), 'gcp-cfg-'));
  try {
    const importPath = JSON.stringify(join(root, 'server/config.mjs'));
    const exec = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${importPath}); console.log('started')`],
      { cwd: tempCwd, env: { PATH: process.env.PATH, NODE_ENV: 'production', ...env }, encoding: 'utf8' });
    const strong = { ADMIN_PASSWORD: 'a-long-unique-demo-passphrase', SESSION_SECRET: 'k'.repeat(48) };
    const cases = [
      [{}, /ADMIN_PASSWORD is required/],
      [{ ADMIN_PASSWORD: strong.ADMIN_PASSWORD }, /SESSION_SECRET is required/],
      [{ ...strong, ADMIN_PASSWORD: 'short' }, /ADMIN_PASSWORD must be at least 12/],
      [{ ...strong, ADMIN_PASSWORD: 'replace-with-a-long-random-password' }, /must not be a placeholder/],
      [{ ...strong, SESSION_SECRET: 'too-short' }, /SESSION_SECRET must be at least 32/],
      [{ ...strong, SESSION_SECRET: 'replace-with-at-least-32-random-characters' }, /must not be a placeholder/],
    ];
    for (const [env, pattern] of cases) {
      const result = exec(env);
      assert.notEqual(result.status, 0, JSON.stringify(env));
      assert.match(result.stderr, pattern);
      assert.doesNotMatch(result.stdout, /started/);
    }
    const ok = exec(strong);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /started/);
  } finally {
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test('real process: honours PORT, serves /healthz, shuts down cleanly on SIGTERM and keeps data across a restart', async (t) => {
  const dir = tempDir(t);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', GCP_DEMO_MODE: 'true', GCP_DB_PATH: join(dir, 'data', 'gcp.sqlite'),
    ADMIN_PASSWORD: 'a-long-unique-demo-passphrase', SESSION_SECRET: 's'.repeat(48), COOKIE_SECURE: 'false', SEED_SAMPLE_LEADS: 'true' };
  const base = `http://127.0.0.1:${port}`;
  const boot = async () => {
    const child = spawn(process.execPath, [join(root, 'scripts/server.mjs')], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    for (let i = 0; i < 100; i += 1) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up yet */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { child, exited, output: () => output };
  };
  const stop = async (proc) => {
    proc.child.kill('SIGTERM');
    const result = await Promise.race([proc.exited, new Promise((resolve) => setTimeout(() => resolve({ code: 'timeout' }), 8000))]);
    assert.deepEqual(result, { code: 0, signal: null }, proc.output());
    assert.match(proc.output(), /Shutdown complete/);
  };

  const first = await boot();
  t.after(() => first.child.kill('SIGKILL'));
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true, demoMode: true });
  assert.doesNotMatch(first.output(), /a-long-unique-demo-passphrase|s{48}/, 'secrets are not logged');
  const partner = await submitIsoApplication(base);
  assert.equal(partner.status, 201);
  const merchant = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merchantInquiry(DEMO_IDENTITIES[1])) });
  const lead = await merchant.json();
  await stop(first);
  // After a clean shutdown the WAL has been folded into the main database file.
  assert.ok(!readdirSync(join(dir, 'data')).some((name) => name.endsWith('-wal')), 'no WAL file left behind');

  const second = await boot();
  t.after(() => second.child.kill('SIGKILL'));
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: env.ADMIN_PASSWORD }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const list = await (await fetch(`${base}/api/admin/iso/organizations`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(list.organizations.map((o) => o.id), [partner.body.reference]);
  const leads = await (await fetch(`${base}/api/admin/leads`, { headers: { Cookie: cookie } })).json();
  assert.ok(leads.leads.some((l) => l.id === lead.id));
  await stop(second);
});
