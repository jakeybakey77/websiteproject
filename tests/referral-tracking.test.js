// v2.3 ISO referral tracking: migration 3, referral-code lifecycle, atomic public
// attribution, idempotent submission, audited corrections and record-only analytics.
// Runs against a real server and a real SQLite file. Synthetic identities only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { MIGRATIONS, runMigrations } from '../server/migrations.mjs';
import { parsePublicOrigin } from '../server/config.mjs';
import { generateReferralCode, inquiryDigest } from '../server/referral-store.mjs';
import { DEMO_IDENTITIES } from '../public/js/data/demo-identities.js';
import { REFERRAL_CODE_PATTERN, readReferralParam, referralPath } from '../public/js/lib/referral-code.js';
import { CREDENTIALS, isoApplication, login, merchantInquiry, start, submitIsoApplication } from './helpers/server.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ISO = '/api/admin/iso';
const SEEDED = 18; // sample merchant leads present in every fresh test database
const REASON = 'Corrected after reviewing the fictional demo attribution.';
const tempDir = (t) => { const dir = mkdtempSync(join(tmpdir(), 'gcp-ref-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

const ok = async (promise, status = 200) => { const res = await promise; assert.equal(res.status, status, JSON.stringify(res.body)); return res.body; };
const stage = (admin, id, payload) => admin.post(`${ISO}/organizations/${id}/stage`, payload);

/** Walks a fictional partner through the real review pipeline up to `until`. */
async function onboard(admin, base, index = 0, until = 'active_partner') {
  const id = (await submitIsoApplication(base, isoApplication(index))).body.reference;
  const path = ['research_needed', 'under_review', 'verified', 'outreach_ready', 'contacted', 'engaged', 'active_partner'];
  for (const next of path) {
    if (next === 'verified') {
      const added = await ok(admin.post(`${ISO}/organizations/${id}/evidence`, { category: 'business_identity', sourceType: 'registry', claim: 'Fictional registry lists the entity.', observedOn: '2026-10-15' }), 201);
      await ok(admin.post(`${ISO}/evidence/${added.evidenceId}/review`, { status: 'confirmed', notes: 'Checked against the fictional registry record.' }));
      await ok(admin.post(`${ISO}/organizations/${id}/verification`, { status: 'verified', note: 'Registry entry matches the organization.' }));
    }
    await ok(stage(admin, id, { stage: next, note: 'Fictional progress note for the demo.' }));
    if (next === until) break;
  }
  return id;
}
const issue = (admin, id) => admin.post(`${ISO}/organizations/${id}/referral-codes`);
const codesOf = async (admin, id) => (await admin.get(`${ISO}/organizations/${id}/referral-codes`)).body;
const referralsOf = async (admin, id, query = '') => (await admin.get(`${ISO}/organizations/${id}/referrals${query}`)).body;
const leadsOf = async (admin, query = '') => (await admin.get(`/api/admin/leads${query}`)).body.leads;
const leadReferral = async (admin, leadId) => (await admin.get(`/api/admin/leads/${leadId}/referral`)).body.referral;
const correct = (admin, leadId, payload, options) => admin.post(`/api/admin/leads/${leadId}/referral`, payload, options);

async function submit(base, { identity = DEMO_IDENTITIES[0], headers = {}, ...extra } = {}) {
  const res = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ ...merchantInquiry(identity), ...extra }) });
  return { status: res.status, body: await res.json(), headers: res.headers };
}
const tableCounts = (db) => Object.fromEntries(['leads', 'lead_referrals', 'lead_referral_events', 'lead_submission_keys', 'audit_log']
  .map((table) => [table, Number(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)]));

// Schema -------------------------------------------------------------------------

test('migration 3 upgrades a v2.1 database in place, keeps every row, and is recorded once', (t) => {
  const path = join(tempDir(t), 'v21.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec('PRAGMA foreign_keys = ON;');
  assert.deepEqual(runMigrations(legacy, MIGRATIONS.slice(0, 2)), [1, 2]);
  legacy.prepare(`INSERT INTO leads(id,demo,contact_name,business_name,email,phone,industry,state,time_in_business,use_of_funds,has_existing_financing,stage,source,medium,campaign,received_at,created_at,updated_at)
    VALUES('DEMO-V21-1',1,'Riley Sample','Example Street Bakery','riley.sample@example.com','(203) 555-0101','retail','CT','2_5y','inventory','no','in_review','meta_ads','paid_social','spring','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run();
  legacy.prepare(`INSERT INTO iso_organizations(id,display_name,name_key,acquisition_source,stage,verification_status,score,tier,created_at,updated_at)
    VALUES('ISO-V21-1','Sample Harbor Partners','sample harbor partners','csv_import','active_partner','verified',71,'B','2026-10-01','2026-10-01')`).run();
  legacy.prepare("INSERT INTO audit_log(actor,action,lead_id,iso_organization_id,detail_json,at) VALUES('reviewer','review_saved','DEMO-V21-1',NULL,'{}','2026-10-02T00:00:00.000Z')").run();
  const dump = (handle) => JSON.stringify(['leads', 'iso_organizations', 'audit_log'].map((table) => handle.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()));
  const before = dump(legacy);
  legacy.close();

  const db = openDatabase(path, { seed: true });
  assert.equal(db.schemaVersion(), 3);
  assert.equal(dump(db.raw), before, 'no historic lead, partner or audit row changed');
  assert.deepEqual(tableCounts(db), { leads: 1, lead_referrals: 0, lead_referral_events: 0, lead_submission_keys: 0, audit_log: 1 });
  assert.equal(db.referrals.leadSummaries().size, 0, 'a pre-v2.3 inquiry stays direct');
  assert.deepEqual(db.raw.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map((r) => [Number(r.version), r.name]).at(-1), [3, 'iso_referral_tracking']);
  // Mixed history: analytics work over an unattributed v2.1 inquiry.
  const stats = db.referrals.analytics();
  assert.deepEqual([stats.totalMerchantInquiries, stats.referredInquiries, stats.directOrUnattributedInquiries], [1, 0, 1]);
  // An already-active, verified v2.1 partner gets no link automatically.
  assert.equal(db.referrals.listCodes('ISO-V21-1').activeCode, null);
  assert.equal(db.referrals.issueCode('ISO-V21-1', 'reviewer').created, true);
  db.close();

  const again = new DatabaseSync(path);
  assert.deepEqual(runMigrations(again), [], 'a repeat startup applies nothing');
  // The v2.1 application (migrations 1-2 only) refuses the newer schema instead of running on it.
  assert.throws(() => runMigrations(again, MIGRATIONS.slice(0, 2)), /newer than this application/);
  again.close();
});

test('migration 3 rolls back completely when it fails part-way', (t) => {
  const raw = new DatabaseSync(join(tempDir(t), 'rollback.sqlite'));
  runMigrations(raw, MIGRATIONS.slice(0, 2));
  const broken = [...MIGRATIONS.slice(0, 2), { ...MIGRATIONS[2], sql: `${MIGRATIONS[2].sql}; CREATE TABLE leads (id TEXT);` }];
  assert.throws(() => runMigrations(raw, broken), /Migration 3 \(iso_referral_tracking\) failed and was rolled back/);
  assert.equal(Number(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('iso_referral_codes','lead_referrals','lead_referral_events','lead_submission_keys')").get().n), 0);
  assert.equal(Number(raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v), 2);
  assert.deepEqual(runMigrations(raw), [3], 'the real migration then applies cleanly');
  raw.close();
});

test('database guards hold when the service layer is bypassed', (t) => {
  const db = openDatabase(join(tempDir(t), 'guards.sqlite'), { seed: true });
  const raw = db.raw;
  const org = (id, stageValue, verification) => raw.prepare(`INSERT INTO iso_organizations(id,display_name,name_key,acquisition_source,stage,verification_status,created_at,updated_at)
    VALUES(?,?,?,'csv_import',?,?,'2026-11-11','2026-11-11')`).run(id, `Sample ${id}`, `sample ${id}`, stageValue, verification);
  org('ISO-ACTIVE', 'active_partner', 'verified');
  org('ISO-ENGAGED', 'engaged', 'verified');
  org('ISO-NEW', 'imported', 'unverified');
  const code = (id, orgId, status = 'active', value = generateReferralCode()) => raw.prepare(`INSERT INTO iso_referral_codes(id,iso_organization_id,code,status,created_by,created_at${status === 'revoked' ? ',revoked_by,revoked_at,revoke_reason' : ''})
    VALUES(?,?,?,?,'x','2026-11-11'${status === 'revoked' ? ",'x','2026-11-11','reason given'" : ''})`).run(id, orgId, value, status);

  assert.throws(() => code('RC-1', 'ISO-ENGAGED'), /active, verified partner/, 'verified but not active: no code');
  assert.throws(() => code('RC-1', 'ISO-NEW'), /active, verified partner/);
  assert.throws(() => code('RC-1', 'ISO-ACTIVE', 'active', 'DEMO-ISO-001'), /CHECK constraint/, 'predictable documentation-style codes are refused');
  code('RC-1', 'ISO-ACTIVE');
  assert.throws(() => code('RC-2', 'ISO-ACTIVE'), /UNIQUE constraint/, 'one active code per organization');
  const value = raw.prepare("SELECT code FROM iso_referral_codes WHERE id = 'RC-1'").get().code;
  assert.throws(() => raw.prepare("UPDATE iso_referral_codes SET code = ? WHERE id = 'RC-1'").run(generateReferralCode()), /only be revoked/);
  assert.throws(() => raw.prepare("DELETE FROM iso_referral_codes WHERE id = 'RC-1'").run(), /never deleted/);
  assert.throws(() => raw.prepare("UPDATE iso_referral_codes SET status = 'revoked' WHERE id = 'RC-1'").run(), /CHECK constraint/, 'a revocation must record who, when and why');

  const leadId = raw.prepare('SELECT id FROM leads ORDER BY id LIMIT 1').get().id;
  const credit = (orgId, codeId = null) => raw.prepare(`INSERT INTO lead_referrals(lead_id,iso_organization_id,referral_code_id,method,first_attributed_at,updated_at,updated_by) VALUES(?,?,?,?,'t','t','x')`)
    .run(leadId, orgId, codeId, codeId ? 'public_code' : 'manual');
  assert.throws(() => credit('ISO-ENGAGED'), /active, verified partner/, 'an ineligible partner cannot be credited');
  assert.throws(() => credit('ISO-NOPE'), /active, verified partner|FOREIGN KEY/);
  credit('ISO-ACTIVE', 'RC-1');
  assert.throws(() => credit('ISO-ACTIVE'), /UNIQUE constraint/, 'one credited partner per inquiry');
  assert.throws(() => raw.prepare("UPDATE lead_referrals SET iso_organization_id = 'ISO-ENGAGED' WHERE lead_id = ?").run(leadId), /active, verified partner/);

  raw.prepare(`INSERT INTO lead_referral_events(lead_id,new_iso_id,referral_code_id,event_type,actor,reason,at) VALUES(?,'ISO-ACTIVE','RC-1','created','public-demo','public_referral_code','t')`).run(leadId);
  assert.throws(() => raw.prepare("UPDATE lead_referral_events SET actor = 'someone-else'").run(), /append-only/);
  assert.throws(() => raw.prepare('DELETE FROM lead_referral_events').run(), /append-only/);
  assert.throws(() => raw.prepare(`INSERT INTO lead_referral_events(lead_id,old_iso_id,event_type,actor,reason,at) VALUES(?,'ISO-ACTIVE','removed','x','short','t')`).run(leadId), /CHECK constraint/, 'a human change needs a real reason');

  // Leaving the active stage revokes the code inside the same statement, even via raw SQL.
  raw.prepare("UPDATE iso_organizations SET stage = 'engaged' WHERE id = 'ISO-ACTIVE'").run();
  const revoked = raw.prepare("SELECT * FROM iso_referral_codes WHERE id = 'RC-1'").get();
  assert.deepEqual([revoked.status, revoked.revoked_by, revoked.revoke_reason, revoked.code], ['revoked', 'system:schema-guard', 'partner_stage_changed', value]);
  assert.match(revoked.revoked_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  raw.prepare("UPDATE iso_organizations SET stage = 'active_partner' WHERE id = 'ISO-ACTIVE'").run();
  assert.throws(() => raw.prepare("UPDATE iso_referral_codes SET status = 'active', revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL WHERE id = 'RC-1'").run(), /never edited or reactivated/);
  assert.equal(raw.prepare("SELECT status FROM iso_referral_codes WHERE id = 'RC-1'").get().status, 'revoked', 'reactivating the partner does not revive the code');
  assert.throws(() => code('RC-3', 'ISO-ACTIVE', 'active', value), /UNIQUE constraint/, 'a revoked code value can never be issued again');
  assert.equal(raw.prepare('SELECT iso_organization_id FROM lead_referrals WHERE lead_id = ?').get(leadId).iso_organization_id, 'ISO-ACTIVE', 'historic credit is untouched');

  // The merchant table gained nothing from the partner side.
  assert.ok(!raw.prepare('PRAGMA table_info(leads)').all().some((c) => /iso|tier|score|referr/i.test(c.name)));
  db.close();
});

// Code format and URL handling ------------------------------------------------------

test('codes are opaque 144-bit tokens and the ref parameter is never guessed at', () => {
  const codes = new Set(Array.from({ length: 500 }, generateReferralCode));
  assert.equal(codes.size, 500);
  for (const code of codes) assert.match(code, REFERRAL_CODE_PATTERN);
  assert.equal(Buffer.from([...codes][0].slice(4), 'base64url').length, 18);
  const source = readFileSync(join(root, 'server/referral-store.mjs'), 'utf8');
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /iso_score|override_tier|\btier\b.*FROM|iso_evidence|iso_contacts|computeIsoScore/, 'the referral store never reads partner scores, evidence or contacts');

  const [code] = codes;
  const read = (query) => readReferralParam(new URL(`https://demo.example/apply.html${query}`).searchParams);
  assert.deepEqual(read(''), { status: 'none' });
  assert.deepEqual(read('?utm_source=meta_ads'), { status: 'none' });
  assert.deepEqual(read(`?ref=${code}&utm_source=meta_ads`), { status: 'ok', code });
  assert.deepEqual(read(`?ref=${code}&ref=${code}`), { status: 'invalid', reason: 'multiple' });
  for (const bad of ['?ref=', '?ref=DEMO-ISO-001', `?ref=${code}x`, `?ref=${code.toUpperCase()}`, '?ref=gcp_%E2%9C%93aaaaaaaaaaaaaaaaaaaaaaa', `?ref=%20${code}`]) {
    assert.deepEqual(read(bad), { status: 'invalid', reason: 'malformed' }, bad);
  }
  assert.equal(new URL(referralPath(code), 'https://demo.example').searchParams.get('ref'), code);
});

test('an absolute referral link comes only from a vetted configured origin', async (t) => {
  assert.equal(parsePublicOrigin(undefined), '');
  assert.equal(parsePublicOrigin(''), '');
  assert.equal(parsePublicOrigin('https://demo.example/'), 'https://demo.example');
  assert.equal(parsePublicOrigin('http://localhost:4173'), 'http://localhost:4173');
  for (const bad of ['demo.example', 'http://demo.example', 'https://demo.example/apply', 'https://user:pw@demo.example', 'https://demo.example/?x=1', 'javascript:alert(1)', 'ftp://demo.example']) {
    assert.throws(() => parsePublicOrigin(bad), /GCP_PUBLIC_ORIGIN/, bad);
  }

  const relative = await start(t);
  const admin = await login(relative.base);
  const id = await onboard(admin, relative.base);
  const res = await fetch(`${relative.base}${ISO}/organizations/${id}/referral-codes`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken, 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https', Forwarded: 'host=evil.example' }, body: '{}' });
  const issued = await res.json();
  assert.equal(res.status, 201);
  assert.equal(issued.code.referralUrl, `/apply.html?ref=${issued.code.code}`, 'no configured origin: a relative path, never a forwarded host');
  assert.doesNotMatch(JSON.stringify(issued), /evil\.example/);

  const absolute = await start(t, { overrides: { publicBaseUrl: 'https://demo.example' } });
  const admin2 = await login(absolute.base);
  const id2 = await onboard(admin2, absolute.base);
  const issued2 = await ok(issue(admin2, id2), 201);
  assert.equal(issued2.code.referralUrl, `https://demo.example/apply.html?ref=${issued2.code.code}`);
});

// Code lifecycle -----------------------------------------------------------------------

test('a link is issued only to an active, verified partner; issuing twice changes nothing', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = (await submitIsoApplication(base)).body.reference;
  const refuse = async (label) => {
    const res = await issue(admin, id);
    assert.equal(res.status, 422, label);
    assert.match(res.body.error, /active partner with verified business status/);
    const state = await codesOf(admin, id);
    assert.deepEqual([state.eligibility.eligible, state.activeCode, state.codes.length], [false, null, 0], label);
  };
  await refuse('applied');
  for (const next of ['research_needed', 'under_review']) { await ok(stage(admin, id, { stage: next })); await refuse(next); }
  const added = await ok(admin.post(`${ISO}/organizations/${id}/evidence`, { category: 'business_identity', sourceType: 'registry', claim: 'Fictional registry lists the entity.' }), 201);
  await ok(admin.post(`${ISO}/evidence/${added.evidenceId}/review`, { status: 'confirmed', notes: 'Checked against the fictional registry record.' }));
  await ok(admin.post(`${ISO}/organizations/${id}/verification`, { status: 'verified', note: 'Registry entry matches the organization.' }));
  await refuse('verified status alone, still under_review');
  for (const next of ['verified', 'outreach_ready', 'contacted', 'engaged']) { await ok(stage(admin, id, { stage: next })); await refuse(next); }
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM iso_referral_codes').get().n, 0);

  const active = await ok(stage(admin, id, { stage: 'active_partner' }));
  // Reaching the stage issues nothing by itself, and a low tier does not gate issuance.
  assert.equal((await codesOf(admin, id)).activeCode, null);
  await ok(admin.post(`${ISO}/organizations/${id}/score/override`, { tier: 'D', justification: 'Fictional low priority for the demo.' }));
  assert.ok(active.organization.stage === 'active_partner');

  const first = await ok(issue(admin, id), 201);
  assert.equal(first.created, true);
  assert.match(first.code.code, REFERRAL_CODE_PATTERN);
  assert.ok(!first.code.code.includes(id) && !first.code.id.includes(id));
  assert.deepEqual([first.code.status, first.code.createdBy, first.code.demo], ['active', 'reviewer', true]);
  assert.ok(!('score' in first.code) && !/contact|tier|score/i.test(JSON.stringify(first)));
  const auditCount = () => app.db.listAuditForIso(id).filter((e) => e.action === 'iso_referral_code_issued').length;
  assert.equal(auditCount(), 1);

  const second = await ok(issue(admin, id), 200);
  assert.equal(second.created, false);
  assert.deepEqual(second.code, first.code, 'same code, same creation date');
  assert.equal(auditCount(), 1, 'a repeat issue writes no second audit event');
  const state = await codesOf(admin, id);
  assert.deepEqual([state.eligibility.eligible, state.codes.length, state.activeCode.id], [true, 1, first.code.id]);

  // Two issue requests at once still leave exactly one active code.
  const other = await onboard(admin, base, 1);
  const racing = await Promise.all(Array.from({ length: 6 }, () => issue(admin, other)));
  assert.deepEqual(racing.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(racing.map((r) => r.body.code.code)).size, 1);
  assert.equal(app.db.raw.prepare("SELECT COUNT(*) AS n FROM iso_referral_codes WHERE iso_organization_id = ? AND status = 'active'").get(other).n, 1);
  assert.equal((await issue(admin, 'ISO-DOES-NOT-EXIST')).status, 404);
});

test('revoke needs a reason and is idempotent; rotate swaps the link atomically', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const first = (await ok(issue(admin, id), 201)).code;
  const revoke = (codeId, payload) => admin.post(`${ISO}/referral-codes/${codeId}/revoke`, payload);

  for (const bad of [{}, { reason: 'too short' }, { reason: '   a  b  c   ' }, { reason: 42 }]) assert.equal((await revoke(first.id, bad)).status, 422, JSON.stringify(bad));
  assert.equal((await revoke('RC-NOPE', { reason: 'No such code exists here.' })).status, 404);
  assert.equal((await codesOf(admin, id)).activeCode.id, first.id, 'nothing was revoked by the failed attempts');

  for (const bad of [{}, { reason: 'short' }]) assert.equal((await admin.post(`${ISO}/organizations/${id}/referral-codes/rotate`, bad)).status, 422);
  const rotated = await ok(admin.post(`${ISO}/organizations/${id}/referral-codes/rotate`, { reason: 'Fictional link shared too widely.' }), 201);
  assert.deepEqual([rotated.revoked.id, rotated.revoked.status, rotated.revoked.revokedBy, rotated.revoked.referralUrl], [first.id, 'revoked', 'reviewer', null]);
  assert.equal(rotated.code.status, 'active');
  assert.notEqual(rotated.code.code, first.code);
  assert.equal((await submit(base, { referralCode: first.code })).status, 422, 'the old link is dead');
  assert.equal((await submit(base, { referralCode: rotated.code.code })).status, 201, 'the new link works');

  const done = await ok(revoke(rotated.code.id, { reason: 'Ending the fictional demo link.' }));
  assert.deepEqual([done.revoked, done.code.status, done.code.revokeReason, done.code.revokedBy], [true, 'revoked', 'Ending the fictional demo link.', 'reviewer']);
  const audits = () => app.db.listAuditForIso(id).filter((e) => e.action === 'iso_referral_code_revoked').length;
  const before = audits();
  const repeat = await ok(revoke(rotated.code.id, { reason: 'Sending the same revoke again.' }));
  assert.deepEqual([repeat.revoked, repeat.code.revokeReason, repeat.code.revokedAt], [false, 'Ending the fictional demo link.', done.code.revokedAt]);
  assert.equal(audits(), before, 'a repeat revoke adds no event');
  assert.equal((await admin.post(`${ISO}/organizations/${id}/referral-codes/rotate`, { reason: 'Nothing active to rotate now.' })).status, 422);

  // A fresh issue after revocation is a new code; the dead ones stay dead.
  const third = (await ok(issue(admin, id), 201)).code;
  const state = await codesOf(admin, id);
  assert.deepEqual(state.codes.map((c) => c.status).sort(), ['active', 'revoked', 'revoked']);
  assert.equal(new Set(state.codes.map((c) => c.code)).size, 3);
  assert.equal(state.activeCode.id, third.id);
});

test('leaving active_partner revokes the link in the same transaction; reactivation never revives it', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code;
  const referred = await submit(base, { referralCode: code.code });
  assert.equal(referred.status, 201);
  const opened = code.code; // a merchant opened the link while it was active...

  // A stage change that fails validation changes neither the stage nor the code.
  assert.equal((await stage(admin, id, { stage: 'archived' })).status, 422);
  assert.equal((await codesOf(admin, id)).activeCode.id, code.id);

  await ok(stage(admin, id, { stage: 'engaged' }));
  const state = await codesOf(admin, id);
  assert.deepEqual([state.activeCode, state.eligibility.eligible], [null, false]);
  assert.deepEqual([state.codes[0].status, state.codes[0].revokedBy, state.codes[0].revokeReason], ['revoked', 'system:reviewer', 'partner_stage_changed']);
  const audit = app.db.listAuditForIso(id);
  const revokeEvent = audit.find((e) => e.action === 'iso_referral_code_revoked');
  assert.deepEqual([revokeEvent.actor, revokeEvent.detail.stageBefore, revokeEvent.detail.stageAfter], ['system:reviewer', 'active_partner', 'engaged']);
  assert.equal(revokeEvent.at, audit.find((e) => e.action === 'iso_stage_changed' && e.detail.stageAfter === 'engaged').at, 'one transaction, one timestamp');

  // ...and submits after the downgrade: refused, and nothing at all is stored.
  const before = tableCounts(app.db);
  const late = await submit(base, { referralCode: opened, submissionId: randomUUID() });
  assert.equal(late.status, 422);
  assert.equal(late.body.code, 'referral_unavailable');
  assert.match(late.body.error, /Remove the referral code to continue as a direct demo inquiry/);
  assert.deepEqual(tableCounts(app.db), before);
  assert.equal((await issue(admin, id)).status, 422, 'no new link while not active');

  // The inquiry credited earlier keeps its historical attribution.
  assert.equal((await leadReferral(admin, referred.body.id)).current.isoOrganizationId, id);
  assert.equal((await referralsOf(admin, id)).total, 1);

  // Reactivation: old link stays revoked, nothing is issued automatically, a new one is deliberate.
  await ok(stage(admin, id, { stage: 'active_partner' }));
  assert.equal((await codesOf(admin, id)).activeCode, null);
  assert.equal((await submit(base, { referralCode: opened })).status, 422);
  const fresh = (await ok(issue(admin, id), 201)).code;
  assert.notEqual(fresh.code, opened);
  assert.equal((await submit(base, { referralCode: fresh.code })).status, 201);

  // Archiving and disqualifying revoke too.
  await ok(stage(admin, id, { stage: 'disqualified', note: 'Fictional disqualification for the demo.', reason: 'out_of_scope' }));
  assert.equal((await codesOf(admin, id)).activeCode, null);
  assert.equal((await submit(base, { referralCode: fresh.code })).status, 422);
  const second = await onboard(admin, base, 1);
  const archivedCode = (await ok(issue(admin, second), 201)).code;
  await ok(stage(admin, second, { stage: 'archived', note: 'Fictional archive for the demo.' }));
  assert.equal((await submit(base, { referralCode: archivedCode.code })).status, 422);

  // If the revocation cannot be written, the stage change does not happen either.
  const third = await onboard(admin, base, 2);
  await ok(issue(admin, third), 201);
  app.db.raw.exec("CREATE TRIGGER test_block_revoke BEFORE UPDATE ON iso_referral_codes BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  assert.equal((await stage(admin, third, { stage: 'engaged' })).status, 500);
  app.db.raw.exec('DROP TRIGGER test_block_revoke;');
  assert.equal(app.db.iso.getOrganization(third).stage, 'active_partner', 'the stage change rolled back with the failed revocation');
  assert.ok((await codesOf(admin, third)).activeCode);
});

// Public attribution ------------------------------------------------------------------

test('direct and referred inquiries both work; UTM fields stay independent of partner credit', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code.code;

  const direct = await submit(base);
  assert.equal(direct.status, 201);
  assert.deepEqual(direct.body.referralAttribution, { recorded: false });
  assert.deepEqual([direct.body.stage, direct.body.source, direct.body.medium, direct.body.demo], ['new', 'google', 'cpc', true]);

  // A client-supplied organization id, name or UTM source is never enough for credit.
  const spoof = await submit(base, { identity: DEMO_IDENTITIES[1], isoOrganizationId: id, isoDisplayName: 'Sample Harbor', source: 'referral', campaign: id });
  assert.equal(spoof.status, 201);
  assert.deepEqual(spoof.body.referralAttribution, { recorded: false });

  const referred = await submit(base, { identity: DEMO_IDENTITIES[2], referralCode: code, source: 'meta_ads', medium: 'paid_social', campaign: 'partner_demo', submissionId: randomUUID() });
  assert.equal(referred.status, 201);
  assert.deepEqual(referred.body.referralAttribution, { recorded: true });
  assert.deepEqual([referred.body.source, referred.body.medium, referred.body.campaign], ['meta_ads', 'paid_social', 'partner_demo']);
  // The applicant's receipt says nothing about the partner.
  assert.doesNotMatch(JSON.stringify(referred.body), new RegExp(`${id}|Sample Harbor Partners|score|tier|${code}`));

  const leads = await leadsOf(admin);
  const byId = Object.fromEntries(leads.map((lead) => [lead.id, lead]));
  assert.equal(leads.length, SEEDED + 3);
  assert.equal(byId[direct.body.id].referral, null);
  assert.equal(byId[spoof.body.id].referral, null);
  assert.deepEqual(byId[spoof.body.id].source, 'referral', 'the UTM value is kept as a UTM value');
  const summary = byId[referred.body.id].referral;
  assert.deepEqual([summary.isoOrganizationId, summary.method, typeof summary.isoDisplayName, typeof summary.attributedAt], [id, 'public_code', 'string', 'string']);
  assert.deepEqual(Object.keys(summary).sort(), ['attributedAt', 'isoDisplayName', 'isoOrganizationId', 'method']);
  assert.deepEqual([byId[referred.body.id].source, byId[referred.body.id].campaign], ['meta_ads', 'partner_demo']);
  assert.ok(byId[referred.body.id].validation.status, 'existing fields and screening are unchanged');
  assert.equal(JSON.stringify(byId[referred.body.id].validation), JSON.stringify({ ...byId[direct.body.id].validation }), 'referred and direct inquiries with the same answers screen identically');
  assert.deepEqual((await leadsOf(admin, `?referredBy=${id}`)).map((l) => l.id), [referred.body.id]);
  assert.equal((await leadsOf(admin, '?referredBy=direct')).length, SEEDED + 2);

  const view = await leadReferral(admin, referred.body.id);
  assert.deepEqual([view.current.isoOrganizationId, view.current.method, view.original.isoOrganizationId, view.history.length], [id, 'public_code', id, 1]);
  assert.deepEqual([view.history[0].eventType, view.history[0].actor, view.history[0].oldIsoOrganizationId, view.history[0].referralCodeId], ['created', 'public-demo', null, view.current.referralCodeId]);
  assert.deepEqual(await leadReferral(admin, direct.body.id), { leadId: direct.body.id, syntheticOnly: true, current: null, original: null, history: [] });

  // Audit rows link the inquiry and the partner, and never contain the code value.
  const events = app.db.listAudit(500);
  const created = events.find((e) => e.action === 'lead_referral_created');
  assert.deepEqual([created.leadId, created.isoOrganizationId, created.detail.method], [referred.body.id, id, 'public_code']);
  assert.equal(events.filter((e) => e.action === 'demo_inquiry_created').length, 3);
  for (const table of ['audit_log', 'iso_activity', 'lead_referral_events']) {
    assert.doesNotMatch(JSON.stringify(app.db.raw.prepare(`SELECT * FROM ${table}`).all()), new RegExp(code), `${table} never stores the code value`);
  }
});

test('an invalid, unknown, revoked, repeated or malformed code is refused with nothing stored', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code.code;
  const engaged = await onboard(admin, base, 1, 'engaged');
  const before = tableCounts(app.db);

  const flipped = code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A');
  const cases = { unknown: generateReferralCode(), 'wrong case': code.slice(0, 4) + [...code.slice(4)].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join(''),
    'one character off': flipped, 'documentation style': 'DEMO-ISO-001', 'iso id': id, 'ineligible iso id': engaged, empty: '', padded: ` ${code}`, 'too long': `${code}x`,
    'repeated (array)': [code, code], 'single-item array': [code], object: { code }, number: 12345, boolean: true, 'sql-ish': "gcp_' OR 1=1 --aaaaaaaaaaaaaa" };
  for (const [label, referralCode] of Object.entries(cases)) {
    const res = await submit(base, { referralCode, submissionId: randomUUID() });
    assert.equal(res.status, 422, label);
    assert.equal(res.body.code, 'referral_unavailable', label);
    assert.match(res.body.error, /Remove the referral code to continue as a direct demo inquiry/, label);
    assert.doesNotMatch(JSON.stringify(res.body), /Sample Harbor|ISO-/, `${label}: no partner detail in the error`);
  }
  assert.deepEqual(tableCounts(app.db), before, 'no lead, credit, event, key or audit row was written');

  // A bad application with a good code is still a bad application, and stores nothing.
  assert.equal((await submit(base, { referralCode: code, identity: { contactName: 'Pat Real', businessName: 'Real Co', email: 'pat@real.com', phone: '(212) 867-5309' } })).status, 422);
  assert.equal((await submit(base, { referralCode: code, answers: {} })).status, 422);
  assert.equal((await submit(base, { submissionId: 'short' })).status, 422);
  assert.equal((await submit(base, { submissionId: ['a'.repeat(20)] })).status, 422);
  assert.deepEqual(tableCounts(app.db), before);

  // Removing the code is the deliberate way to continue: a plain direct inquiry.
  const direct = await submit(base);
  assert.deepEqual([direct.status, direct.body.referralAttribution.recorded], [201, false]);
  // Demo mode off stays closed, with or without a code.
  const closed = await start(t, { overrides: { demoMode: false } });
  assert.equal((await submit(closed.base, { referralCode: code })).status, 503);
});

// Idempotency --------------------------------------------------------------------------

test('a replayed submission returns the original receipt and creates nothing; a changed replay is a conflict', async (t) => {
  const first = await start(t, { cleanup: false });
  t.after(() => rmSync(first.dir, { recursive: true, force: true }));
  const { base } = first;
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code;
  const submissionId = randomUUID();
  const payload = { referralCode: code.code, submissionId, source: 'Meta Ads', medium: 'Paid_Social', campaign: 'partner_demo' };

  const original = await submit(base, payload);
  assert.equal(original.status, 201);
  assert.equal(original.headers.get('idempotent-replay'), null);
  const counts = tableCounts(first.app.db);

  const replay = await submit(base, payload);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  assert.deepEqual(replay.body, original.body);
  // Canonicalization: field order and UTM spelling that normalize to the same request are the same request.
  const reordered = await fetch(`${base}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId, campaign: 'partner_demo', medium: 'paid_social', source: 'meta ads', referralCode: code.code, ...(({ answers, identity }) => ({ answers: Object.fromEntries(Object.entries(answers).reverse()), identity }))(merchantInquiry(DEMO_IDENTITIES[0])) }) });
  assert.equal(reordered.status, 200);
  assert.deepEqual(await reordered.json(), original.body);
  assert.deepEqual(tableCounts(first.app.db), counts, 'no second lead, credit, event, key or audit row');

  // Same key, materially different request: 409, and still nothing new.
  const altered = [{ ...payload, campaign: 'something_else' }, { ...payload, referralCode: undefined }, { ...payload, identity: DEMO_IDENTITIES[1] },
    { ...payload, answers: { ...merchantInquiry().answers, amountRequested: '99000' } }];
  for (const variant of altered) {
    const res = await submit(base, variant);
    assert.equal(res.status, 409, JSON.stringify(variant));
    assert.equal(res.body.code, 'submission_conflict');
  }
  assert.deepEqual(tableCounts(first.app.db), counts);

  // Later review activity is not readable through a replay.
  await ok(admin.post(`/api/admin/leads/${original.body.id}/review`, { stage: 'in_review', note: 'Fictional internal reviewer note.' }));
  // The link is revoked, the credit is corrected away, and the retry still gets its original receipt.
  await ok(admin.post(`${ISO}/referral-codes/${code.id}/revoke`, { reason: 'Fictional revocation before the retry.' }));
  await ok(correct(admin, original.body.id, { isoOrganizationId: null, reason: REASON }));
  const afterRevoke = await submit(base, payload);
  assert.equal(afterRevoke.status, 200);
  assert.deepEqual(afterRevoke.body, original.body, 'original receipt, original stage, no reviewer note');
  assert.doesNotMatch(JSON.stringify(afterRevoke.body), /Fictional internal reviewer note|in_review/);
  // A genuinely new application with that revoked link is refused.
  assert.equal((await submit(base, { ...payload, submissionId: randomUUID() })).status, 422);

  // Legacy clients without a key are still accepted; each request is its own inquiry.
  const legacyA = await submit(base, { identity: DEMO_IDENTITIES[3] });
  const legacyB = await submit(base, { identity: DEMO_IDENTITIES[3] });
  assert.deepEqual([legacyA.status, legacyB.status], [201, 201]);
  assert.notEqual(legacyA.body.id, legacyB.body.id);
  // The same fictional identity with a new key is a distinct inquiry, never deduplicated by contact details.
  const distinct = await submit(base, { submissionId: randomUUID() });
  assert.equal(distinct.status, 201);
  assert.notEqual(distinct.body.id, original.body.id);

  // Restart: the key, the lead and the history are all still there.
  const finalCounts = tableCounts(first.app.db);
  await first.close();
  const second = await start(t, { dir: first.dir });
  assert.deepEqual(tableCounts(second.app.db), finalCounts);
  const afterRestart = await submit(second.base, payload);
  assert.equal(afterRestart.status, 200);
  assert.deepEqual(afterRestart.body, original.body);
  assert.equal((await submit(second.base, { ...payload, campaign: 'changed_after_restart' })).status, 409);
  assert.deepEqual(tableCounts(second.app.db), finalCounts);
  const admin2 = await login(second.base);
  const history = (await leadReferral(admin2, original.body.id)).history.map((e) => e.eventType);
  assert.deepEqual(history, ['created', 'removed']);
});

test('the digest covers the whole validated request and nothing volatile', () => {
  const base = { identity: { ...DEMO_IDENTITIES[0] }, answers: { b: 2, a: [1, 2], demoAcknowledged: true }, attribution: { source: 'meta_ads', medium: 'paid_social', campaign: 'x' }, referralCode: null, submissionId: 'one' };
  const digest = inquiryDigest(base);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(inquiryDigest({ ...base, submissionId: 'two', answers: { demoAcknowledged: true, a: [1, 2], b: 2 } }), digest, 'key order and the submission key itself do not matter');
  for (const changed of [{ referralCode: generateReferralCode() }, { attribution: { ...base.attribution, campaign: 'y' } }, { answers: { ...base.answers, a: [2, 1] } }, { identity: { ...DEMO_IDENTITIES[1] } }]) {
    assert.notEqual(inquiryDigest({ ...base, ...changed }), digest, JSON.stringify(changed));
  }
});

test('concurrent retries, issuance and rotation cannot double-count or credit a dead link', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code;

  // Eight simultaneous sends of one submission: one inquiry, one credit.
  const submissionId = randomUUID();
  const burst = await Promise.all(Array.from({ length: 8 }, () => submit(base, { referralCode: code.code, submissionId })));
  assert.deepEqual(burst.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 200, 200, 201]);
  assert.equal(new Set(burst.map((r) => r.body.id)).size, 1);
  assert.equal((await referralsOf(admin, id)).total, 1);
  assert.equal(app.db.raw.prepare('SELECT COUNT(*) AS n FROM lead_submission_keys').get().n, 1);

  // Submissions racing a rotation: each one either committed against the code that was
  // live at its commit, or was refused. Nothing is ever credited through the revoked code afterwards.
  const [rotation, ...racers] = await Promise.all([
    admin.post(`${ISO}/organizations/${id}/referral-codes/rotate`, { reason: 'Fictional rotation during a burst.' }),
    ...Array.from({ length: 6 }, (_, i) => submit(base, { referralCode: code.code, submissionId: randomUUID(), identity: DEMO_IDENTITIES[i % DEMO_IDENTITIES.length] })),
  ]);
  assert.equal(rotation.status, 201);
  for (const racer of racers) assert.ok([201, 422].includes(racer.status));
  const accepted = racers.filter((r) => r.status === 201).length;
  assert.equal((await referralsOf(admin, id)).total, 1 + accepted);
  const revokedAt = rotation.body.revoked.revokedAt;
  const viaOld = app.db.raw.prepare('SELECT first_attributed_at AS at FROM lead_referrals WHERE referral_code_id = ?').all(code.id);
  assert.equal(viaOld.length, 1 + accepted);
  assert.ok(viaOld.every((row) => row.at <= revokedAt), 'no credit through the old code after its revocation committed');
  assert.equal((await submit(base, { referralCode: code.code })).status, 422);

  // A second connection (another process) cannot create a second active code either.
  const second = openDatabase(app.db.raw.prepare('PRAGMA database_list').get().file);
  t.after(() => { try { second.close(); } catch { /* already closed */ } });
  assert.throws(() => second.raw.prepare("INSERT INTO iso_referral_codes(id,iso_organization_id,code,status,created_by,created_at) VALUES('RC-RACE',?,?,'active','x','t')").run(id, generateReferralCode()), /UNIQUE constraint/);
  assert.equal(second.referrals.issueCode(id, 'reviewer').created, false, 'issue through another connection returns the existing code');
  second.close();
});

// Corrections --------------------------------------------------------------------------

test('manual corrections are reasoned, audited, append-only and count exactly once', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const a = await onboard(admin, base, 0);
  const b = await onboard(admin, base, 1);
  const engaged = await onboard(admin, base, 2, 'engaged');
  const codeA = (await ok(issue(admin, a), 201)).code;
  const referred = (await submit(base, { referralCode: codeA.code })).body.id;
  const direct = (await submit(base, { identity: DEMO_IDENTITIES[1] })).body.id;
  const total = async (id) => (await referralsOf(admin, id)).total;
  const eventCount = () => Number(app.db.raw.prepare('SELECT COUNT(*) AS n FROM lead_referral_events').get().n);

  // Input rules.
  for (const [label, payload, status] of [
    ['no reason', { isoOrganizationId: b }, 422], ['short reason', { isoOrganizationId: b, reason: 'because' }, 422], ['whitespace reason', { isoOrganizationId: b, reason: ' a b c d e ' }, 422],
    ['target omitted', { reason: REASON }, 422], ['target wrong type', { isoOrganizationId: 7, reason: REASON }, 422], ['target empty', { isoOrganizationId: '', reason: REASON }, 422],
    ['unknown target', { isoOrganizationId: 'ISO-NOPE', reason: REASON }, 422], ['ineligible target', { isoOrganizationId: engaged, reason: REASON }, 422],
    ['bad request id', { isoOrganizationId: b, reason: REASON, requestId: 'x' }, 422]]) {
    assert.equal((await correct(admin, referred, payload)).status, status, label);
  }
  assert.equal((await correct(admin, 'DEMO-NOPE', { isoOrganizationId: b, reason: REASON })).status, 404);
  assert.equal((await admin.get('/api/admin/leads/DEMO-NOPE/referral')).status, 404);
  assert.deepEqual([await total(a), await total(b), eventCount()], [1, 0, 1], 'refused corrections changed nothing');

  // Same effective value: no-op, no event.
  const same = await ok(correct(admin, referred, { isoOrganizationId: a, reason: REASON }));
  assert.equal(same.changed, false);
  const noop = await ok(correct(admin, direct, { isoOrganizationId: null, reason: REASON }));
  assert.equal(noop.changed, false);
  assert.equal(eventCount(), 1);

  // Reassign A -> B. Counts move exactly once; a retry with the same request id is not a second change.
  const requestId = randomUUID();
  const moved = await ok(correct(admin, referred, { isoOrganizationId: b, reason: REASON, requestId }));
  assert.equal(moved.changed, true);
  assert.deepEqual([moved.referral.current.isoOrganizationId, moved.referral.current.method, moved.referral.current.updatedBy, moved.referral.current.referralCodeId], [b, 'manual', 'reviewer', null]);
  assert.deepEqual([moved.referral.original.isoOrganizationId, moved.referral.original.referralCodeId], [a, codeA.id], 'the original public-code credit is still on record');
  assert.equal(moved.referral.current.firstAttributedAt, moved.referral.original.at);
  const retried = await ok(correct(admin, referred, { isoOrganizationId: b, reason: REASON, requestId }));
  assert.deepEqual([retried.changed, retried.replayed], [false, true]);
  assert.deepEqual([await total(a), await total(b), eventCount()], [0, 1, 2]);
  assert.deepEqual((await leadsOf(admin, `?referredBy=${b}`)).map((l) => l.id), [referred]);

  // Assign a direct inquiry, then remove it again.
  const assigned = await ok(correct(admin, direct, { isoOrganizationId: a, reason: REASON }));
  assert.deepEqual([assigned.changed, assigned.referral.current.method, assigned.referral.original, assigned.referral.history[0].eventType], [true, 'manual', null, 'corrected']);
  assert.deepEqual([await total(a), await total(b)], [1, 1]);
  const removed = await ok(correct(admin, direct, { isoOrganizationId: null, reason: REASON }));
  assert.deepEqual([removed.changed, removed.referral.current, removed.referral.history.map((e) => e.eventType)], [true, null, ['corrected', 'removed']]);
  assert.equal((await leadsOf(admin)).find((l) => l.id === direct).referral, null);

  // Historic credit to a partner that later goes inactive stays until a correction removes it,
  // but that partner can no longer be the target of a new correction.
  await ok(stage(admin, b, { stage: 'engaged' }));
  assert.equal(await total(b), 1);
  assert.equal((await leadReferral(admin, referred)).current.isoOrganizationId, b);
  assert.equal((await correct(admin, direct, { isoOrganizationId: b, reason: REASON })).status, 422);
  const cleared = await ok(correct(admin, referred, { isoOrganizationId: null, reason: 'Removing credit from a now inactive fictional partner.' }));
  assert.equal(cleared.referral.current, null);
  assert.equal(await total(b), 0);

  // The full trail is still there, in order, with actors and reasons; nothing was rewritten.
  const view = await leadReferral(admin, referred);
  assert.deepEqual(view.history.map((e) => [e.eventType, e.oldIsoOrganizationId, e.newIsoOrganizationId, e.actor]),
    [['created', null, a, 'public-demo'], ['corrected', a, b, 'reviewer'], ['removed', b, null, 'reviewer']]);
  assert.ok(view.history.every((e) => e.reason && e.at));
  assert.equal(view.original.isoOrganizationId, a);
  assert.throws(() => app.db.raw.prepare('UPDATE lead_referral_events SET reason = ?').run('rewritten history'), /append-only/);

  // Audit: the lead and both affected partners.
  const audit = app.db.listAudit(500);
  const corrected = audit.filter((e) => e.action === 'lead_referral_corrected' && e.leadId === referred);
  assert.deepEqual(corrected.map((e) => e.isoOrganizationId).sort(), [a, b].sort());
  assert.ok(corrected.every((e) => e.actor === 'reviewer' && e.detail.reason === REASON && e.detail.oldIsoOrganizationId === a && e.detail.newIsoOrganizationId === b));
  assert.equal(audit.filter((e) => e.action === 'lead_referral_removed' && e.leadId === referred && e.isoOrganizationId === b).length, 1);
  assert.ok(app.db.listAuditForIso(a).some((e) => e.action === 'lead_referral_corrected'), "visible in the old partner's own audit trail");

  // Merchant workflow is untouched by attribution changes.
  const lead = (await leadsOf(admin)).find((l) => l.id === referred);
  assert.deepEqual([lead.stage, lead.reviewHistory.length], ['new', 0]);
});

// Security -------------------------------------------------------------------------------

test('referral admin routes need a session and CSRF; the public sees no partner, code or score', async (t) => {
  const { base, app } = await start(t);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code;
  const lead = (await submit(base, { referralCode: code.code })).body.id;
  const before = JSON.stringify([await codesOf(admin, id), await leadReferral(admin, lead)]);

  const reads = [`${ISO}/organizations/${id}/referral-codes`, `${ISO}/organizations/${id}/referrals`, `${ISO}/analytics`, `/api/admin/leads/${lead}/referral`, '/api/admin/leads'];
  for (const path of reads) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 401, path);
    assert.doesNotMatch(await res.text(), new RegExp(`${code.code}|Sample Harbor|${id}`));
  }
  const writes = [[`${ISO}/organizations/${id}/referral-codes`, {}], [`${ISO}/organizations/${id}/referral-codes/rotate`, { reason: REASON }],
    [`${ISO}/referral-codes/${code.id}/revoke`, { reason: REASON }], [`/api/admin/leads/${lead}/referral`, { isoOrganizationId: null, reason: REASON }]];
  for (const [path, payload] of writes) {
    assert.equal((await admin.post(path, payload, { withCookie: false })).status, 401, `no session: ${path}`);
    assert.equal((await admin.post(path, payload, { csrf: null })).status, 403, `no CSRF: ${path}`);
    assert.equal((await admin.post(path, payload, { csrf: 'forged-token' })).status, 403, `forged CSRF: ${path}`);
  }
  assert.equal(JSON.stringify([await codesOf(admin, id), await leadReferral(admin, lead)]), before, 'nothing changed');

  // No public lookup, enumeration or validation oracle for codes or organizations.
  for (const path of [`/api/referral-codes/${code.code}`, `/api/iso/organizations/${id}`, `/api/inquiries?ref=${code.code}`, `/api/iso/referral-codes`, `/apply.html?ref=${code.code}`]) {
    const res = await fetch(`${base}${path}`);
    const body = await res.text();
    assert.doesNotMatch(body, /Sample Harbor Partners|"score"|"tier"/, path);
    if (path.startsWith('/api/')) assert.ok([404, 405].includes(res.status), `${path} -> ${res.status}`);
  }
  // Possessing a code grants no access to anything.
  const withCode = await fetch(`${base}${ISO}/organizations/${id}`, { headers: { Authorization: `Bearer ${code.code}`, 'X-Referral-Code': code.code } });
  assert.equal(withCode.status, 401);

  // Admin referral views expose no merchant contact fields and no partner contact or score.
  const listing = JSON.stringify(await referralsOf(admin, id));
  assert.doesNotMatch(listing, /example\.com|555-01|Riley|Example Street Bakery/);
  assert.doesNotMatch(JSON.stringify(await codesOf(admin, id)), /"score"|"tier"|example\.com|555-01/);
  // Nothing on the merchant side can see partner scoring through the new module.
  for (const file of ['server/inquiry.mjs', 'public/js/lib/referral-code.js']) {
    assert.doesNotMatch(readFileSync(join(root, file), 'utf8'), /iso-scoring|iso-store|iso_score|computeIsoScore|iso_organizations/, file);
  }
  assert.doesNotMatch(readFileSync(join(root, 'server/iso-store.mjs'), 'utf8'), /\b(FROM|INTO|UPDATE|JOIN)\s+leads\b/i);
  // Partner scoring is unaffected by referral volume.
  const score = app.db.iso.getOrganization(id).score;
  await submit(base, { referralCode: code.code, identity: DEMO_IDENTITIES[1] });
  await ok(admin.post(`${ISO}/organizations/${id}/score/recalculate`));
  assert.equal(app.db.iso.getOrganization(id).score, score);
  assert.equal((await admin.call('DELETE', `${ISO}/referral-codes/${code.id}/revoke`)).status, 405);
});

// Analytics ------------------------------------------------------------------------------

test('referral analytics count stored records only, include zero stages, and never invent a rate', async (t) => {
  const { base } = await start(t);
  const admin = await login(base);
  const analytics = async (query = '') => (await admin.get(`${ISO}/analytics${query}`)).body.analytics.referrals;
  const zeroStages = { new: 0, needs_info: 0, in_review: 0, ready_for_handoff: 0, handed_off: 0, closed: 0 };

  const empty = await analytics();
  assert.deepEqual([empty.syntheticOnly, empty.totalMerchantInquiries, empty.referredInquiries, empty.directOrUnattributedInquiries, empty.attributedInquiriesByIso.length], [true, SEEDED, 0, SEEDED, 0]);
  assert.match(empty.label, /Synthetic demonstration/);
  for (const key of ['clicks', 'clickToInquiryConversion', 'qualifiedRate', 'closeRate', 'fundedAmount', 'revenue', 'commissions']) assert.equal(empty.notMeasured[key], null, key);
  assert.doesNotMatch(JSON.stringify(Object.keys(empty)), /conversion|funded|commission|roas/i);

  const a = await onboard(admin, base, 0);
  const b = await onboard(admin, base, 1);
  const quiet = await referralsOf(admin, a);
  assert.deepEqual([quiet.total, quiet.items, quiet.summary.attributedInquiries, quiet.summary.merchantStageBreakdown, quiet.summary.partnerShareOfSubmissions], [0, [], 0, zeroStages, 0]);

  const codeA = (await ok(issue(admin, a), 201)).code;
  const viaFirst = [];
  for (let i = 0; i < 2; i += 1) viaFirst.push((await submit(base, { referralCode: codeA.code, identity: DEMO_IDENTITIES[i] })).body.id);
  // Two codes from one partner aggregate to one organization, with no double count.
  const codeA2 = (await ok(admin.post(`${ISO}/organizations/${a}/referral-codes/rotate`, { reason: 'Fictional rotation for the analytics test.' }), 201)).code;
  const viaSecond = (await submit(base, { referralCode: codeA2.code, identity: DEMO_IDENTITIES[2] })).body.id;
  const codeB = (await ok(issue(admin, b), 201)).code;
  const viaB = (await submit(base, { referralCode: codeB.code, identity: DEMO_IDENTITIES[3] })).body.id;
  await submit(base, { identity: DEMO_IDENTITIES[4] });
  await ok(admin.post(`/api/admin/leads/${viaFirst[0]}/review`, { stage: 'in_review', note: 'Fictional review note.' }));
  await ok(admin.post(`/api/admin/leads/${viaFirst[0]}/review`, { stage: 'ready_for_handoff', note: 'Fictional review note.' }));
  await ok(admin.post(`/api/admin/leads/${viaFirst[1]}/review`, { stage: 'in_review', note: 'Fictional review note.' }));
  await ok(admin.post(`/api/admin/leads/${viaFirst[1]}/review`, { stage: 'ready_for_handoff', note: 'Fictional review note.' }));
  await ok(admin.post(`/api/admin/leads/${viaFirst[1]}/review`, { stage: 'handed_off', note: 'Fictional simulated handoff.' }));

  const total = SEEDED + 5;
  const stats = await analytics();
  assert.deepEqual([stats.totalMerchantInquiries, stats.referredInquiries, stats.directOrUnattributedInquiries, stats.organizationsWithCredit, stats.activeReferralCodes], [total, 4, total - 4, 2, 2]);
  assert.deepEqual(stats.attributedInquiriesByIso.map((row) => [row.isoOrganizationId, row.attributedInquiries]), [[a, 3], [b, 1]]);
  const rowA = stats.attributedInquiriesByIso[0];
  assert.deepEqual(rowA.merchantStageBreakdown, { ...zeroStages, new: 1, ready_for_handoff: 1, handed_off: 1 });
  assert.deepEqual([rowA.reviewReadyCount, rowA.simulatedHandoffCount, rowA.partnerShareOfSubmissions], [1, 1, 3 / total]);
  assert.match(stats.notes.reviewReadyCount, /Not an approval/);
  assert.match(stats.notes.simulatedHandoffCount, /not funded/);
  assert.match(stats.notes.basis, /Current effective attribution by submission date/);
  assert.doesNotMatch(JSON.stringify(stats.attributedInquiriesByIso), /"score"|"tier"|contact/i);

  // Per-partner list: bounded pages, query-backed total, ids/dates/stages only.
  const page1 = await referralsOf(admin, a, '?pageSize=2');
  assert.deepEqual([page1.total, page1.page, page1.pageSize, page1.items.length], [3, 1, 2, 2]);
  const page2 = await referralsOf(admin, a, '?pageSize=2&page=2');
  assert.deepEqual([page2.items.length, page2.page], [1, 2]);
  assert.deepEqual([...page1.items, ...page2.items].map((i) => i.leadId).sort(), [...viaFirst, viaSecond].sort());
  assert.deepEqual(Object.keys(page1.items[0]).sort(), ['attributedAt', 'leadId', 'merchantStage', 'method', 'receivedAt']);
  assert.equal((await referralsOf(admin, a, '?page=9')).items.length, 0);
  assert.equal((await referralsOf(admin, a, '?pageSize=100000')).pageSize, 100);
  assert.deepEqual([(await referralsOf(admin, a, '?pageSize=-3&page=abc')).pageSize, (await referralsOf(admin, a, '?pageSize=-3&page=abc')).page], [25, 1]);
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(page1.summary.newReferralsByDay, [{ date: today, count: 3 }]);
  assert.deepEqual([page1.summary.attributedInquiries, page1.summary.reviewReadyCount, page1.summary.simulatedHandoffCount], [3, 1, 1]);
  assert.equal((await admin.get(`${ISO}/organizations/ISO-NOPE/referrals`)).status, 404);

  // Windows filter on the inquiry's received date; an empty window reports no data, not 0%.
  const windowed = await analytics(`?from=${today}&to=${today}`);
  assert.ok(windowed.totalMerchantInquiries >= 5 && windowed.totalMerchantInquiries <= total);
  assert.equal(windowed.referredInquiries, 4);
  const past = await analytics('?from=2001-01-01&to=2001-12-31');
  assert.deepEqual([past.totalMerchantInquiries, past.referredInquiries, past.attributedInquiriesByIso], [0, 0, []]);
  const pastA = await referralsOf(admin, a, '?from=2001-01-01&to=2001-12-31');
  assert.deepEqual([pastA.total, pastA.summary.partnerShareOfSubmissions, pastA.summary.merchantStageBreakdown], [0, null, zeroStages]);
  for (const bad of ['?from=yesterday', '?to=2026-02-30', '?from=2026-12-01&to=2026-01-01']) assert.equal((await admin.get(`${ISO}/analytics${bad}`)).status, 422, bad);

  // A correction moves the current totals exactly once.
  await ok(correct(admin, viaB, { isoOrganizationId: a, reason: REASON }));
  const after = await analytics();
  assert.deepEqual(after.attributedInquiriesByIso.map((row) => [row.isoOrganizationId, row.attributedInquiries]), [[a, 4]]);
  assert.deepEqual([after.referredInquiries, after.organizationsWithCredit], [4, 1]);
  // The existing partner analytics are still served alongside.
  const whole = (await admin.get(`${ISO}/analytics`)).body.analytics;
  assert.equal(whole.byStage.active_partner, 2);
  assert.equal(whole.notMeasured.outreachSent, null);
});

// Real process -----------------------------------------------------------------------------

test('real process: a referred inquiry survives SIGTERM and its retry still returns the original receipt', async (t) => {
  const dir = tempDir(t);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', GCP_DEMO_MODE: 'true', GCP_DB_PATH: join(dir, 'data', 'gcp.sqlite'),
    ADMIN_USERNAME: CREDENTIALS.username, ADMIN_PASSWORD: CREDENTIALS.password, SESSION_SECRET: 's'.repeat(48), COOKIE_SECURE: 'false', SEED_SAMPLE_LEADS: 'true', GCP_PUBLIC_ORIGIN: 'https://demo.example' };
  const base = `http://127.0.0.1:${port}`;
  const boot = async () => {
    const child = spawn(process.execPath, [join(root, 'scripts/server.mjs')], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    t.after(() => child.kill('SIGKILL'));
    for (let i = 0; i < 100; i += 1) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* not up yet */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { child, exited, output: () => output };
  };
  const stop = async (proc) => {
    proc.child.kill('SIGTERM');
    assert.deepEqual(await Promise.race([proc.exited, new Promise((resolve) => setTimeout(() => resolve({ code: 'timeout' }), 8000))]), { code: 0, signal: null }, proc.output());
  };

  const first = await boot();
  assert.match(first.output(), /schema v3/);
  const admin = await login(base);
  const id = await onboard(admin, base);
  const code = (await ok(issue(admin, id), 201)).code;
  assert.equal(code.referralUrl, `https://demo.example/apply.html?ref=${code.code}`);
  const payload = { referralCode: code.code, submissionId: randomUUID(), source: 'meta_ads' };
  const original = await submit(base, payload);
  assert.equal(original.status, 201);
  assert.doesNotMatch(first.output(), new RegExp(code.code), 'the code is not written to the server log');
  await stop(first);

  const second = await boot();
  const retry = await submit(base, payload);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, original.body);
  const admin2 = await login(base);
  const listing = await referralsOf(admin2, id);
  assert.deepEqual([listing.total, listing.items[0].leadId], [1, original.body.id]);
  assert.equal((await codesOf(admin2, id)).activeCode.code, code.code);
  assert.equal((await leadsOf(admin2)).find((l) => l.id === original.body.id).source, 'meta_ads');
  await stop(second);
});
