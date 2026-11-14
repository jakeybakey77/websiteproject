// Rehearses a schema upgrade and a restore using only copies of a backup file.
//
//   node scripts/rehearse-migration.mjs <backup.sqlite>
//
// 1. Copies the backup into a new temporary directory (the backup itself is opened
//    read-only and never written).
// 2. Opens one copy with this application's database layer, which applies any
//    pending migrations, then proves every row that existed before is unchanged.
// 3. Restores the backup to a second path and proves it is byte-identical and still
//    at the original schema version (the rollback path).
// Exit code 0 only if every check passes. Nothing here connects to a deployment.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { MIGRATIONS, runMigrations } from '../server/migrations.mjs';
import { inspectDatabase } from './backup-db.mjs';

const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;

function dumpTables(path, tables) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(tables.map((name) => [name, JSON.stringify(db.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all())]));
  } finally {
    db.close();
  }
}

export function rehearse(backupPath, { keep = false } = {}) {
  const backup = resolve(backupPath);
  const before = inspectDatabase(backup);
  const checks = [];
  const check = (name, pass, detail = '') => { checks.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) }); };
  check('backup passes integrity and foreign-key checks', before.ok, before.integrity.join('; '));

  const dir = mkdtempSync(join(tmpdir(), 'gcp-rehearsal-'));
  const migrated = join(dir, 'migrated.sqlite');
  const restored = join(dir, 'restored.sqlite');
  try {
    const targetVersion = Math.max(...MIGRATIONS.map((m) => m.version));
    // Tables whose rows a migration must not change. schema_migrations is expected to grow.
    const preserved = Object.keys(before.rows).filter((name) => name !== 'schema_migrations');
    const original = dumpTables(backup, preserved);

    copyFileSync(backup, migrated);
    const db = openDatabase(migrated, { seed: false });
    const versionAfter = db.schemaVersion();
    db.close();
    const after = inspectDatabase(migrated);
    check(`copy migrated from schema v${before.schemaVersion} to v${targetVersion}`, versionAfter === targetVersion, `reached v${versionAfter}`);
    check('migrated copy passes integrity and foreign-key checks', after.ok, after.integrity.join('; '));
    const current = dumpTables(migrated, preserved);
    const changed = preserved.filter((name) => current[name] !== original[name]);
    check('every pre-existing row is unchanged after migration', changed.length === 0, changed.join(', '));
    const added = Object.keys(after.rows).filter((name) => !(name in before.rows));
    check('tables added by the migration start empty', added.every((name) => after.rows[name] === 0), added.map((name) => `${name}=${after.rows[name]}`).join(', '));
    check('schema_migrations gained exactly the pending versions', after.rows.schema_migrations === (before.rows.schema_migrations ?? 0) + (targetVersion - before.schemaVersion));

    const reopened = new DatabaseSync(migrated);
    check('a second startup applies nothing', runMigrations(reopened).length === 0);
    // The application version that produced the backup must refuse the upgraded file rather than run on it.
    let refused = before.schemaVersion >= targetVersion;
    if (!refused) { try { runMigrations(reopened, MIGRATIONS.filter((m) => m.version <= before.schemaVersion)); } catch (error) { refused = /newer than this application/.test(error.message); } }
    reopened.close();
    check('the previous application version refuses the migrated file', refused);

    copyFileSync(backup, restored);
    const back = inspectDatabase(restored);
    check('restored file is byte-identical to the backup', back.sha256 === before.sha256);
    check(`restored file is still schema v${before.schemaVersion} and intact`, back.ok && back.schemaVersion === before.schemaVersion);
    check('restored rows match the backup', JSON.stringify(dumpTables(restored, preserved)) === JSON.stringify(original));
    check('the backup file itself was not modified', inspectDatabase(backup).sha256 === before.sha256);

    return { passed: checks.every((c) => c.pass), backup: { path: backup, schemaVersion: before.schemaVersion, rows: before.rows, sha256: before.sha256 },
      migrated: { schemaVersion: after.schemaVersion, rows: after.rows, tablesAdded: added }, checks, workDir: keep ? dir : null };
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [backupPath, flag] = process.argv.slice(2);
  if (!backupPath) {
    console.error('Usage: node scripts/rehearse-migration.mjs <backup.sqlite> [--keep]');
    process.exit(2);
  }
  try {
    const result = rehearse(backupPath, { keep: flag === '--keep' });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
