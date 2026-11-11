import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { sampleLeads } from '../public/js/data/sample-leads.js';
import { runMigrations, schemaVersion } from './migrations.mjs';
import { createIsoStore } from './iso-store.mjs';

const json = (value, fallback) => {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

function toDbLead(lead) {
  const now = new Date().toISOString();
  return {
    id: lead.id,
    demo: lead.demo === true ? 1 : 0,
    contact_name: lead.contactName ?? '',
    business_name: lead.businessName ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    industry: lead.industry ?? '',
    state: lead.state ?? '',
    time_in_business: lead.timeInBusiness ?? '',
    monthly_revenue: lead.monthlyRevenue ?? null,
    amount_requested: lead.amountRequested ?? null,
    use_of_funds: lead.useOfFunds ?? '',
    use_of_funds_detail: lead.useOfFundsDetail ?? '',
    has_existing_financing: lead.hasExistingFinancing ?? '',
    existing_financing_types_json: JSON.stringify(lead.existingFinancingTypes ?? []),
    existing_financing_balance: lead.existingFinancingBalance ?? null,
    demo_acknowledged: lead.demoAcknowledged === true ? 1 : 0,
    stage: lead.stage ?? 'new',
    follow_up_reason: lead.followUpReason ?? '',
    source: lead.source ?? 'direct',
    medium: lead.medium ?? '',
    campaign: lead.campaign ?? '',
    received_at: lead.receivedAt ?? now,
    last_review_note: lead.lastReviewNote ?? '',
    reviewed_at: lead.reviewedAt ?? null,
    review_history_json: JSON.stringify(lead.reviewHistory ?? []),
    workflow_milestones_json: JSON.stringify(lead.workflowMilestones ?? {}),
    created_at: lead.createdAt ?? now,
    updated_at: now,
  };
}

function fromDbLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    demo: row.demo === 1,
    contactName: row.contact_name,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    industry: row.industry,
    state: row.state,
    timeInBusiness: row.time_in_business,
    monthlyRevenue: row.monthly_revenue,
    amountRequested: row.amount_requested,
    useOfFunds: row.use_of_funds,
    useOfFundsDetail: row.use_of_funds_detail,
    hasExistingFinancing: row.has_existing_financing,
    existingFinancingTypes: json(row.existing_financing_types_json, []),
    existingFinancingBalance: row.existing_financing_balance,
    demoAcknowledged: row.demo_acknowledged === 1,
    stage: row.stage,
    followUpReason: row.follow_up_reason,
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    receivedAt: row.received_at,
    lastReviewNote: row.last_review_note,
    reviewedAt: row.reviewed_at,
    reviewHistory: json(row.review_history_json, []),
    workflowMilestones: json(row.workflow_milestones_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openDatabase(path, { seed = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(db);

  const insertLead = db.prepare(`
    INSERT OR IGNORE INTO leads (
      id,demo,contact_name,business_name,email,phone,industry,state,time_in_business,
      monthly_revenue,amount_requested,use_of_funds,use_of_funds_detail,has_existing_financing,
      existing_financing_types_json,existing_financing_balance,demo_acknowledged,stage,follow_up_reason,
      source,medium,campaign,received_at,last_review_note,reviewed_at,review_history_json,
      workflow_milestones_json,created_at,updated_at
    ) VALUES (
      @id,@demo,@contact_name,@business_name,@email,@phone,@industry,@state,@time_in_business,
      @monthly_revenue,@amount_requested,@use_of_funds,@use_of_funds_detail,@has_existing_financing,
      @existing_financing_types_json,@existing_financing_balance,@demo_acknowledged,@stage,@follow_up_reason,
      @source,@medium,@campaign,@received_at,@last_review_note,@reviewed_at,@review_history_json,
      @workflow_milestones_json,@created_at,@updated_at
    )
  `);

  if (seed) {
    const count = Number(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n);
    if (count === 0) {
      for (const lead of sampleLeads()) insertLead.run(toDbLead(lead));
    }
  }

  const api = {
    raw: db,
    close() {
      // Fold the WAL back into the main file so a volume snapshot or redeploy sees one complete database.
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* best effort */ }
      db.close();
    },
    listLeads() {
      return db.prepare('SELECT * FROM leads ORDER BY received_at DESC, id DESC').all().map(fromDbLead);
    },
    getLead(id) {
      return fromDbLead(db.prepare('SELECT * FROM leads WHERE id = ?').get(id));
    },
    insertLead(lead) {
      insertLead.run(toDbLead(lead));
      return this.getLead(lead.id);
    },
    updateLeadReview(lead) {
      const row = toDbLead(lead);
      const result = db.prepare(`
        UPDATE leads SET
          stage=@stage,
          follow_up_reason=@follow_up_reason,
          last_review_note=@last_review_note,
          reviewed_at=@reviewed_at,
          review_history_json=@review_history_json,
          workflow_milestones_json=@workflow_milestones_json,
          updated_at=@updated_at
        WHERE id=@id
      `).run({
        id: row.id,
        stage: row.stage,
        follow_up_reason: row.follow_up_reason,
        last_review_note: row.last_review_note,
        reviewed_at: row.reviewed_at,
        review_history_json: row.review_history_json,
        workflow_milestones_json: row.workflow_milestones_json,
        updated_at: row.updated_at,
      });
      if (result.changes !== 1) throw new Error('Lead not found.');
      return this.getLead(lead.id);
    },
    createSession({ tokenHash, username, csrfToken, createdAt, expiresAt }) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare('INSERT INTO sessions(token_hash,username,csrf_token,created_at,expires_at) VALUES(?,?,?,?,?)')
        .run(tokenHash, username, csrfToken, createdAt, expiresAt);
    },
    getSession(tokenHash) {
      const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now());
      return row ? {
        tokenHash: row.token_hash,
        username: row.username,
        csrfToken: row.csrf_token,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      } : null;
    },
    deleteSession(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    audit({ actor, action, leadId = null, isoOrgId = null, detail = {} }) {
      db.prepare('INSERT INTO audit_log(actor,action,lead_id,iso_organization_id,detail_json,at) VALUES(?,?,?,?,?,?)')
        .run(actor, action, leadId, isoOrgId, JSON.stringify(detail), new Date().toISOString());
    },
    listAudit(limit = 100) {
      const safe = Math.max(1, Math.min(500, Number(limit) || 100));
      return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(safe).map((row) => ({
        id: row.id, actor: row.actor, action: row.action, leadId: row.lead_id, isoOrganizationId: row.iso_organization_id,
        detail: json(row.detail_json, {}), at: row.at,
      }));
    },
    listAuditForIso(isoOrgId, limit = 200) {
      return db.prepare('SELECT * FROM audit_log WHERE iso_organization_id = ? ORDER BY id DESC LIMIT ?').all(String(isoOrgId), Math.max(1, Math.min(500, Number(limit) || 200))).map((row) => ({
        id: row.id, actor: row.actor, action: row.action, isoOrganizationId: row.iso_organization_id, detail: json(row.detail_json, {}), at: row.at,
      }));
    },
    schemaVersion() { return schemaVersion(db); },
    /** Cheap liveness probe for /healthz: proves the database file is readable. */
    ping() { return Number(db.prepare('SELECT 1 AS ok').get().ok) === 1; },
  };
  api.iso = createIsoStore(db, { audit: (entry) => api.audit(entry) });
  return api;
}

export const hashSessionToken = (token) => createHash('sha256').update(token).digest('hex');
