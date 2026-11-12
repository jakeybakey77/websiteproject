// Consistent backup of the SQLite database, safe to run while the server is up.
//
//   node scripts/backup-db.mjs <source.sqlite> <destination.sqlite>
//
// VACUUM INTO writes one self-contained file from a single read snapshot, so the
// backup includes everything committed to the WAL and never a half-written
// transaction. The source is opened read-only and is not modified. The backup is
// then reopened and checked before this script reports success.
// Copying gcp.sqlite by hand while the server runs is NOT a consistent backup.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;

/** Integrity result, schema version, per-table row counts and file hash of a database file. */
export function inspectDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => Object.values(row)[0]);
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    const rows = Object.fromEntries(tables.map((name) => [name, Number(db.prepare(`SELECT COUNT(*) AS n FROM ${quote(name)}`).get().n)]));
    const schemaVersion = tables.includes('schema_migrations') ? Number(db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations').get().v) : 0;
    return { path, ok: integrity.length === 1 && integrity[0] === 'ok' && foreignKeyViolations === 0, integrity, foreignKeyViolations, schemaVersion, rows,
      bytes: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
  } finally {
    db.close();
  }
}

export function backupDatabase(source, destination) {
  const from = resolve(source);
  const to = resolve(destination);
  if (!existsSync(from)) throw new Error(`Source database not found: ${from}`);
  if (existsSync(to)) throw new Error(`Refusing to overwrite an existing file: ${to}`);
  const db = new DatabaseSync(from, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    db.prepare('VACUUM INTO ?').run(to);
  } finally {
    db.close();
  }
  const report = inspectDatabase(to);
  if (!report.ok) throw new Error(`Backup failed verification: ${JSON.stringify({ integrity: report.integrity, foreignKeyViolations: report.foreignKeyViolations })}`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) {
    console.error('Usage: node scripts/backup-db.mjs <source.sqlite> <destination.sqlite>');
    process.exit(2);
  }
  try {
    const report = backupDatabase(source, destination);
    console.log(JSON.stringify({ backup: 'verified', ...report }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
