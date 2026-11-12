// The backup and rehearsal scripts used before any schema upgrade is deployed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { MIGRATIONS, runMigrations } from '../server/migrations.mjs';
import { backupDatabase, inspectDatabase } from '../scripts/backup-db.mjs';
import { rehearse } from '../scripts/rehearse-migration.mjs';

const tempDir = (t) => { const dir = mkdtempSync(join(tmpdir(), 'gcp-backup-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('a backup taken while the database is open and writing is complete and verified', (t) => {
  const dir = tempDir(t);
  const source = join(dir, 'live.sqlite');
  const db = openDatabase(source, { seed: true });
  t.after(() => { try { db.close(); } catch { /* closed */ } });
  db.audit({ actor: 'reviewer', action: 'written_just_before_backup' });
  // Everything so far may still sit in the write-ahead log, which a plain file copy would miss.
  const report = backupDatabase(source, join(dir, 'backup.sqlite'));
  assert.equal(report.ok, true);
  assert.deepEqual(report.integrity, ['ok']);
  assert.equal(report.schemaVersion, db.schemaVersion());
  assert.deepEqual([report.rows.leads, report.rows.audit_log], [db.listLeads().length, 1]);
  assert.match(report.sha256, /^[0-9a-f]{64}$/);

  // The source keeps working and was not changed by the backup; the backup is a point in time.
  db.audit({ actor: 'reviewer', action: 'written_after_backup' });
  assert.equal(db.listAudit().length, 2);
  assert.equal(inspectDatabase(join(dir, 'backup.sqlite')).rows.audit_log, 1);

  assert.throws(() => backupDatabase(source, join(dir, 'backup.sqlite')), /Refusing to overwrite/);
  assert.throws(() => backupDatabase(join(dir, 'missing.sqlite'), join(dir, 'x.sqlite')), /not found/);
});

test('the rehearsal migrates and restores copies only, and proves existing rows are unchanged', (t) => {
  const dir = tempDir(t);
  const live = join(dir, 'v2.sqlite');
  const raw = new DatabaseSync(live);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  runMigrations(raw, MIGRATIONS.slice(0, 2));
  raw.prepare(`INSERT INTO leads(id,demo,contact_name,business_name,email,phone,industry,state,time_in_business,use_of_funds,has_existing_financing,stage,received_at,created_at,updated_at)
    VALUES('DEMO-OLD-1',1,'Riley Sample','Example Street Bakery','riley.sample@example.com','(203) 555-0101','retail','CT','2_5y','inventory','no','in_review','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')`).run();
  raw.prepare(`INSERT INTO iso_organizations(id,display_name,name_key,acquisition_source,stage,verification_status,created_at,updated_at)
    VALUES('ISO-OLD-1','Sample Harbor Partners','sample harbor partners','csv_import','active_partner','verified','2026-10-01','2026-10-01')`).run();
  const backup = join(dir, 'backup.sqlite');
  const taken = backupDatabase(live, backup);
  raw.close();
  assert.equal(taken.schemaVersion, 2);

  const result = rehearse(backup);
  assert.equal(result.passed, true, JSON.stringify(result.checks.filter((c) => !c.pass)));
  assert.equal(result.checks.length, 12);
  assert.deepEqual([result.backup.schemaVersion, result.migrated.schemaVersion], [2, 3]);
  assert.deepEqual(result.migrated.tablesAdded, ['iso_referral_codes', 'lead_referral_events', 'lead_referrals', 'lead_submission_keys']);
  assert.deepEqual([result.migrated.rows.leads, result.migrated.rows.iso_organizations], [1, 1]);
  // The backup is untouched and still the old schema: it remains a valid rollback point.
  const after = inspectDatabase(backup);
  assert.deepEqual([after.sha256, after.schemaVersion], [taken.sha256, 2]);

  // A damaged backup is reported, not rehearsed as if it were fine.
  const damaged = join(dir, 'damaged.sqlite');
  copyFileSync(backup, damaged);
  const broken = new DatabaseSync(damaged);
  broken.exec('PRAGMA foreign_keys = OFF;');
  broken.prepare("INSERT INTO iso_contacts(organization_id,name,created_by,created_at,updated_at) VALUES('ISO-MISSING','Sam Sample','x','t','t')").run();
  broken.close();
  assert.equal(inspectDatabase(damaged).ok, false);
  assert.equal(rehearse(damaged).passed, false);
});
