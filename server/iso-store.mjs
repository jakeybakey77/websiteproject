// ISO partner CRM: persistence plus the server-owned business rules (stage
// transitions, verification gates, scoring snapshots, import dedupe).
// Reads and writes only iso_* tables and the shared audit log. It never reads
// or writes merchant leads.
import { randomBytes } from 'node:crypto';
import {
  CONTACT_STATUSES, DISQUALIFY_REASONS, EVIDENCE_CATEGORIES, EVIDENCE_SOURCE_TYPES, EVIDENCE_STATUSES,
  ISO_STAGES, ISO_TIERS, REVIEW_BACKLOG_STAGES, STAGES_REQUIRING_NOTE, STAGES_REQUIRING_VERIFICATION,
  VERIFICATION_STATUSES, ACQUISITION_SOURCES, allowedIsoStages, values,
} from '../public/js/config/iso-pipeline.js';
import { isNearName, isSyntheticEmail, nameKey, normalizeDomain, normalizeSyntheticPhone, normalizeSyntheticUrl } from '../public/js/lib/synthetic-identity.js';
import { CURRENT_RULES_VERSION, computeIsoScore } from './iso-scoring.mjs';
import { createTx } from './tx.mjs';
import { IMPORT_FIELDS, IMPORT_LIMITS, decodeCsvUpload, fileHash, parseCsv, resolveMapping, validateImportRow } from './iso-csv.mjs';

const fail = (statusCode, message, fieldErrors) => Object.assign(new Error(message), { statusCode, ...(fieldErrors ? { fieldErrors } : {}) });
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
const today = (now) => now.slice(0, 10);

/** Trimmed single-line text without control characters. Throws 422 when over length. */
function text(value, { field, max, required = false, multiline = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw fail(422, `${field} must be text.`);
  let out = value.replace(multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!multiline) out = out.replace(/\s+/g, ' ');
  if (required && !out) throw fail(422, `${field} is required.`);
  if (out.length > max) throw fail(422, `${field} must be at most ${max} characters.`);
  return out;
}
function oneOf(value, options, field) {
  if (typeof value !== 'string' || !values(options).includes(value)) throw fail(422, `${field} is not a recognized value.`);
  return value;
}
function isoDate(value, field, { required = false } = {}) {
  if (value == null || value === '') { if (required) throw fail(422, `${field} is required.`); return null; }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw fail(422, `${field} must be a valid date (YYYY-MM-DD).`);
  return value;
}

const orgFromRow = (row) => row && ({
  id: row.id,
  demo: row.demo === 1,
  displayName: row.display_name,
  legalName: row.legal_name,
  website: row.website,
  domain: row.domain,
  region: row.region,
  specializations: parse(row.specializations_json, []),
  relationshipType: row.relationship_type,
  acquisitionSource: row.acquisition_source,
  attribution: parse(row.attribution_json, {}),
  application: parse(row.application_json, {}),
  importBatchId: row.import_batch_id,
  stage: row.stage,
  verificationStatus: row.verification_status,
  disqualifyReason: row.disqualify_reason,
  assignedReviewer: row.assigned_reviewer,
  score: row.score,
  computedTier: row.tier,
  tier: row.override_tier ?? row.tier,
  tierOverridden: row.override_tier != null,
  override: row.override_tier ? { tier: row.override_tier, justification: row.override_justification, by: row.override_by, at: row.override_at } : null,
  scoreRulesVersion: row.score_rules_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const contactFromRow = (row) => ({ id: row.id, organizationId: row.organization_id, name: row.name, role: row.role, email: row.email, phone: row.phone, status: row.status, createdBy: row.created_by, createdAt: row.created_at });
const evidenceFromRow = (row) => ({
  id: row.id, organizationId: row.organization_id, category: row.category, sourceType: row.source_type, url: row.url, title: row.title,
  claim: row.claim, observedOn: row.observed_on, status: row.status, notes: row.notes, createdBy: row.created_by, createdAt: row.created_at,
  reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
});
const activityFromRow = (row) => ({ id: row.id, organizationId: row.organization_id, type: row.type, body: row.body, detail: parse(row.detail_json, {}), dueOn: row.due_on, completedAt: row.completed_at, completedBy: row.completed_by, actor: row.actor, at: row.at });
const snapshotFromRow = (row) => ({
  id: row.id, kind: row.kind, rulesVersion: row.rules_version, score: row.score, tier: row.tier, effectiveTier: row.effective_tier,
  factors: parse(row.factors_json, []), notes: parse(row.notes_json, []), inputsDigest: row.inputs_digest, asOf: row.as_of,
  justification: row.justification, actor: row.actor, assessedAt: row.assessed_at,
});
const batchFromRow = (row) => row && ({
  id: row.id, filename: row.filename, byteSize: row.byte_size, mapping: parse(row.mapping_json, {}), status: row.status,
  totalRows: row.total_rows, acceptedRows: row.accepted_rows, rejectedRows: row.rejected_rows, duplicateRows: row.duplicate_rows,
  replayedRows: row.replayed_rows, replayCount: row.replay_count, lastReplayedAt: row.last_replayed_at, createdBy: row.created_by, createdAt: row.created_at,
});
const importRowFromRow = (row) => ({
  id: row.id, batchId: row.batch_id, rowNumber: row.row_number, status: row.status, data: parse(row.data_json, {}), errors: parse(row.errors_json, []),
  matchType: row.match_type, matchedOrganizationId: row.matched_organization_id, organizationId: row.organization_id,
  resolvedBy: row.resolved_by, resolvedAt: row.resolved_at, resolutionNote: row.resolution_note,
});

export function createIsoStore(db, { audit, tx: sharedTx, onLeaveActivePartner = null }) {
  const clock = () => new Date().toISOString();
  // Every multi-statement change is atomic: a crash or restart mid-operation leaves
  // either the whole change or none of it. Nested calls join the outer transaction,
  // including calls into other stores that share this connection's helper.
  const tx = sharedTx ?? createTx(db);

  const getOrgRow = (id) => db.prepare('SELECT * FROM iso_organizations WHERE id = ?').get(String(id));
  function requireOrg(id) {
    const org = orgFromRow(getOrgRow(id));
    if (!org) throw fail(404, 'ISO organization not found.');
    return org;
  }
  const contactsOf = (id) => db.prepare('SELECT * FROM iso_contacts WHERE organization_id = ? ORDER BY id').all(id).map(contactFromRow);
  const evidenceOf = (id) => db.prepare('SELECT * FROM iso_evidence WHERE organization_id = ? ORDER BY id').all(id).map(evidenceFromRow);
  const touch = (id, now) => db.prepare('UPDATE iso_organizations SET updated_at = ? WHERE id = ?').run(now, id);

  function logActivity(orgId, { type, body = '', detail = {}, dueOn = null, actor, now }) {
    const result = db.prepare('INSERT INTO iso_activity(organization_id,type,body,detail_json,due_on,actor,at) VALUES(?,?,?,?,?,?,?)')
      .run(orgId, type, body, JSON.stringify(detail), dueOn, actor, now);
    return Number(result.lastInsertRowid);
  }
  const record = (orgId, action, actor, detail = {}, at) => audit({ actor, action, isoOrgId: orgId, detail, at });

  // Scoring ------------------------------------------------------------------
  const lastComputed = (orgId) => db.prepare("SELECT * FROM iso_score_snapshots WHERE organization_id = ? AND kind = 'computed' ORDER BY id DESC LIMIT 1").get(orgId);

  /** Recomputes from current evidence. Appends a snapshot only when the outcome or its inputs changed. */
  function rescore(orgId, actor, { trigger = 'record_change', now = clock() } = {}) {
    return tx(() => {
      const organization = requireOrg(orgId);
      const result = computeIsoScore({ organization, contacts: contactsOf(orgId), evidence: evidenceOf(orgId) }, { asOf: today(now), rulesVersion: CURRENT_RULES_VERSION });
      const previous = lastComputed(orgId);
      const unchanged = previous && previous.rules_version === result.rulesVersion && previous.inputs_digest === result.inputsDigest
        && previous.score === result.score && previous.tier === result.tier;
      if (unchanged) return { changed: false, result };
      const effective = organization.override?.tier ?? result.tier;
      db.prepare(`INSERT INTO iso_score_snapshots(organization_id,kind,rules_version,score,tier,effective_tier,factors_json,notes_json,inputs_digest,as_of,justification,actor,assessed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orgId, 'computed', result.rulesVersion, result.score, result.tier, effective,
        JSON.stringify(result.factors), JSON.stringify(result.notes), result.inputsDigest, result.asOf, '', actor, now);
      db.prepare('UPDATE iso_organizations SET score=?, tier=?, score_rules_version=?, updated_at=? WHERE id=?').run(result.score, result.tier, result.rulesVersion, now, orgId);
      logActivity(orgId, { type: 'score_recalculated', actor, now, detail: { trigger, score: result.score, tier: result.tier, previousScore: previous?.score ?? null, previousTier: previous?.tier ?? null, rulesVersion: result.rulesVersion } });
      record(orgId, 'iso_score_recalculated', actor, { trigger, score: result.score, tier: result.tier, rulesVersion: result.rulesVersion });
      return { changed: true, result };
    });
  }

  // Creation -----------------------------------------------------------------
  function insertOrganization(input, { actor, now }) {
    const id = newId('ISO');
    db.prepare(`INSERT INTO iso_organizations(id,display_name,legal_name,name_key,website,domain,region,specializations_json,relationship_type,
        acquisition_source,attribution_json,application_json,import_batch_id,stage,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.displayName, input.legalName ?? '', nameKey(input.displayName), input.website ?? '', input.domain ?? '',
      input.region ?? '', JSON.stringify(input.specializations ?? []), input.relationshipType ?? 'unknown', input.acquisitionSource,
      JSON.stringify(input.attribution ?? {}), JSON.stringify(input.application ?? {}), input.importBatchId ?? null, input.stage, now, now);
    logActivity(id, { type: 'created', actor, now, detail: { acquisitionSource: input.acquisitionSource, importBatchId: input.importBatchId ?? null } });
    return id;
  }
  function insertContact(orgId, contact, { actor, now }) {
    const result = db.prepare('INSERT INTO iso_contacts(organization_id,name,role,email,phone,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(orgId, contact.name ?? '', contact.role ?? '', contact.email ?? '', contact.phone ?? '', actor, now, now);
    return Number(result.lastInsertRowid);
  }
  function insertEvidence(orgId, e, { actor, now }) {
    const result = db.prepare(`INSERT INTO iso_evidence(organization_id,category,source_type,url,title,claim,observed_on,status,notes,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,'asserted',?,?,?)`).run(orgId, e.category, e.sourceType, e.url ?? '', e.title ?? '', e.claim, e.observedOn ?? null, e.notes ?? '', actor, now);
    return Number(result.lastInsertRowid);
  }
  /** Statements made by the applicant or the import file are stored as assertions, never as confirmed facts. */
  function seedAssertions(orgId, input, sourceType, ctx) {
    const who = sourceType === 'self_reported' ? 'Applicant states' : 'Import file states';
    if (input.website) insertEvidence(orgId, { category: 'official_domain', sourceType, url: input.website, claim: `${who} the organization website is ${input.domain}.`, observedOn: today(ctx.now) }, ctx);
    if (input.relationshipType && input.relationshipType !== 'unknown') insertEvidence(orgId, { category: 'iso_positioning', sourceType, claim: `${who} the relationship type is "${input.relationshipType}".`, observedOn: today(ctx.now) }, ctx);
  }

  function findMatches({ domain, key }, excludeId = null) {
    const matches = [];
    const seen = new Set(excludeId ? [excludeId] : []);
    const push = (rows, matchType) => { for (const row of rows) if (!seen.has(row.id)) { seen.add(row.id); matches.push({ matchType, organizationId: row.id, displayName: row.display_name, domain: row.domain, stage: row.stage }); } };
    if (domain) push(db.prepare('SELECT id,display_name,domain,stage FROM iso_organizations WHERE domain = ? ORDER BY created_at, id').all(domain), 'exact_domain');
    push(db.prepare('SELECT id,display_name,domain,stage FROM iso_organizations WHERE name_key = ? ORDER BY created_at, id').all(key), 'exact_name');
    push(db.prepare('SELECT id,display_name,domain,stage,name_key FROM iso_organizations ORDER BY created_at, id').all().filter((row) => isNearName(row.name_key, key)), 'near_name');
    return matches;
  }

  return {
    /** Public demo partner application -> its own ISO record. Never touches merchant leads. */
    createFromApplication(validated) {
      const now = clock();
      const actor = 'public-demo';
      return tx(() => {
        const ctx = { actor, now };
        const { identity, answers, attribution } = validated;
        const website = normalizeSyntheticUrl(identity.website);
        const input = {
          displayName: identity.organizationName, website, domain: normalizeDomain(website), region: answers.region,
          specializations: answers.specializations, relationshipType: answers.relationshipType,
          acquisitionSource: 'public_application', attribution, stage: 'applied',
          application: { referralVolume: answers.referralVolume, yearsActive: answers.yearsActive, demoAcknowledged: true },
        };
        const possibleDuplicates = findMatches({ domain: input.domain, key: nameKey(input.displayName) });
        const id = insertOrganization(input, ctx);
        insertContact(id, { name: identity.contactName, role: identity.contactRole, email: identity.email, phone: identity.phone }, ctx);
        seedAssertions(id, input, 'self_reported', ctx);
        rescore(id, 'system', { trigger: 'application_received', now });
        // A repeat application is kept as its own record and flagged; it is never merged automatically.
        record(id, 'iso_application_created', actor, { source: attribution.source, medium: attribution.medium, campaign: attribution.campaign, possibleDuplicateIds: possibleDuplicates.map((m) => m.organizationId) });
        return requireOrg(id);
      });
    },

    listOrganizations(query = {}) {
      const where = [];
      const params = [];
      const filter = (column, value, options) => { if (value) { if (!values(options).includes(value)) throw fail(422, 'Unrecognized filter value.'); where.push(`${column} = ?`); params.push(value); } };
      filter('stage', query.stage, ISO_STAGES);
      filter('verification_status', query.verification, VERIFICATION_STATUSES);
      filter('acquisition_source', query.source, ACQUISITION_SOURCES);
      if (query.tier) {
        if (query.tier === 'unscored') where.push('COALESCE(override_tier, tier) IS NULL');
        else { if (!ISO_TIERS.includes(query.tier)) throw fail(422, 'Unrecognized filter value.'); where.push('COALESCE(override_tier, tier) = ?'); params.push(query.tier); }
      }
      if (query.reviewer) {
        if (query.reviewer === 'unassigned') where.push("assigned_reviewer = ''");
        else { where.push('assigned_reviewer = ?'); params.push(String(query.reviewer).slice(0, 80)); }
      }
      if (query.q) {
        const like = `%${String(query.q).slice(0, 80).toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        where.push("(lower(display_name) LIKE ? ESCAPE '\\' OR lower(domain) LIKE ? ESCAPE '\\' OR lower(id) LIKE ? ESCAPE '\\')");
        params.push(like, like, like);
      }
      const sorts = { name: 'lower(display_name)', score: 'score', created: 'created_at', updated: 'updated_at', stage: 'stage', tier: 'COALESCE(override_tier, tier)' };
      const sort = sorts[query.sort] ?? sorts.created;
      const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
      const rows = db.prepare(`SELECT o.*,
          (SELECT COUNT(*) FROM iso_contacts c WHERE c.organization_id = o.id) AS contact_count,
          (SELECT COUNT(*) FROM iso_evidence e WHERE e.organization_id = o.id) AS evidence_count,
          (SELECT COUNT(*) FROM iso_activity a WHERE a.organization_id = o.id AND a.type = 'follow_up' AND a.completed_at IS NULL) AS open_follow_ups
        FROM iso_organizations o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${sort} IS NULL, ${sort} ${dir}, id ASC LIMIT 500`).all(...params);
      return rows.map((row) => ({ ...orgFromRow(row), contactCount: Number(row.contact_count), evidenceCount: Number(row.evidence_count), openFollowUps: Number(row.open_follow_ups) }));
    },

    getOrganization: (id) => requireOrg(id),

    /** Timeline entry written on behalf of another store that shares this connection. */
    recordActivity(id, { type, body = '', detail = {}, actor, now = clock() }) {
      const activityId = logActivity(id, { type, body, detail, actor, now });
      touch(id, now);
      return activityId;
    },

    getOrganizationDetail(id) {
      const organization = requireOrg(id);
      const snapshots = db.prepare('SELECT * FROM iso_score_snapshots WHERE organization_id = ? ORDER BY id DESC LIMIT 100').all(id).map(snapshotFromRow);
      return {
        organization,
        contacts: contactsOf(id),
        evidence: evidenceOf(id),
        activity: db.prepare('SELECT * FROM iso_activity WHERE organization_id = ? ORDER BY id DESC LIMIT 200').all(id).map(activityFromRow),
        scoreBreakdown: snapshots.find((s) => s.kind === 'computed') ?? null,
        scoreHistory: snapshots,
        allowedStages: allowedIsoStages(organization.stage),
        possibleDuplicates: findMatches({ domain: organization.domain, key: nameKey(organization.displayName) }, id),
      };
    },

    // Review workflow ----------------------------------------------------------
    changeStage(id, input, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(id);
        const stage = oneOf(input?.stage, ISO_STAGES, 'Stage');
        if (stage === org.stage) throw fail(422, 'The organization is already in that stage.');
        if (!allowedIsoStages(org.stage).includes(stage)) throw fail(422, `Stage cannot move from "${org.stage}" to "${stage}".`);
        if (STAGES_REQUIRING_VERIFICATION.includes(stage) && org.verificationStatus !== 'verified') {
          throw fail(422, 'Business verification must be marked "verified" by a reviewer before this stage.');
        }
        const reopening = ['disqualified', 'archived'].includes(org.stage);
        const note = text(input?.note, { field: 'Note', max: 500, multiline: true });
        if ((STAGES_REQUIRING_NOTE.includes(stage) || reopening) && note.length < 10) throw fail(422, 'A note of at least 10 characters is required for this stage change.');
        let reason = '';
        if (stage === 'disqualified') reason = oneOf(input?.reason, DISQUALIFY_REASONS, 'Disqualification reason');
        // Leaving the active stage ends referral eligibility. Demo referral links are revoked
        // inside this same transaction, attributed to the acting reviewer, before the stage is
        // written (a schema trigger would otherwise revoke them anonymously as a backstop).
        if (org.stage === 'active_partner' && onLeaveActivePartner) onLeaveActivePartner({ organizationId: id, actor, now, stageBefore: org.stage, stageAfter: stage });
        db.prepare('UPDATE iso_organizations SET stage=?, disqualify_reason=?, updated_at=? WHERE id=?').run(stage, reason, now, id);
        logActivity(id, { type: 'stage_change', body: note, actor, now, detail: { from: org.stage, to: stage, reason } });
        record(id, 'iso_stage_changed', actor, { stageBefore: org.stage, stageAfter: stage, reason }, now);
        return requireOrg(id);
      });
    },

    changeVerification(id, input, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(id);
        const status = oneOf(input?.status, VERIFICATION_STATUSES, 'Verification status');
        if (status === org.verificationStatus) throw fail(422, 'Verification is already in that state.');
        const note = text(input?.note, { field: 'Note', max: 500, multiline: true });
        const evidence = evidenceOf(id);
        if (status === 'verified') {
          if (!evidence.some((e) => e.status === 'confirmed' && ['official_domain', 'business_identity'].includes(e.category))) {
            throw fail(422, 'Verification needs at least one independently confirmed identity item (official domain or business identity).');
          }
          if (evidence.some((e) => e.status === 'confirmed' && e.category === 'red_flag')) throw fail(422, 'A confirmed red flag is on file. Resolve it before marking the organization verified.');
          if (note.length < 10) throw fail(422, 'Describe what was verified (at least 10 characters).');
        } else if (STAGES_REQUIRING_VERIFICATION.includes(org.stage)) {
          throw fail(422, `Move the organization out of "${org.stage}" before withdrawing verification.`);
        }
        if (status === 'failed' && note.length < 10) throw fail(422, 'Explain why verification failed (at least 10 characters).');
        db.prepare('UPDATE iso_organizations SET verification_status=?, updated_at=? WHERE id=?').run(status, now, id);
        logActivity(id, { type: 'verification_change', body: note, actor, now, detail: { from: org.verificationStatus, to: status } });
        record(id, 'iso_verification_changed', actor, { before: org.verificationStatus, after: status });
        return requireOrg(id);
      });
    },

    assignReviewer(id, input, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(id);
        const reviewer = text(input?.reviewer, { field: 'Reviewer', max: 80 });
        if (reviewer && !/^[A-Za-z0-9._-]+$/.test(reviewer)) throw fail(422, 'Reviewer must be an internal username.');
        db.prepare('UPDATE iso_organizations SET assigned_reviewer=?, updated_at=? WHERE id=?').run(reviewer, now, id);
        logActivity(id, { type: 'assignment', actor, now, detail: { from: org.assignedReviewer, to: reviewer } });
        record(id, 'iso_reviewer_assigned', actor, { before: org.assignedReviewer, after: reviewer });
        return requireOrg(id);
      });
    },

    addContact(id, input, actor) {
      const now = clock();
      return tx(() => {
        requireOrg(id);
        const contact = { name: text(input?.name, { field: 'Name', max: 120 }), role: text(input?.role, { field: 'Role', max: 120 }), email: '', phone: '' };
        const email = text(input?.email, { field: 'Email', max: 160 });
        const phone = text(input?.phone, { field: 'Phone', max: 30 });
        if (email) { if (!isSyntheticEmail(email)) throw fail(422, 'Demo contacts must use a reserved email domain such as example.com. Real addresses are not accepted.'); contact.email = email.toLowerCase(); }
        if (phone) { contact.phone = normalizeSyntheticPhone(phone); if (!contact.phone) throw fail(422, 'Demo contacts must use a fictional 555-01xx phone number. Real numbers are not accepted.'); }
        if (!contact.name && !contact.email && !contact.phone) throw fail(422, 'Provide at least a name, email or phone.');
        const contactId = insertContact(id, contact, { actor, now });
        logActivity(id, { type: 'contact_added', actor, now, detail: { contactId } });
        record(id, 'iso_contact_added', actor, { contactId });
        touch(id, now);
        rescore(id, actor, { trigger: 'contact_added', now });
        return contactId;
      });
    },

    setContactStatus(contactId, input, actor) {
      const now = clock();
      return tx(() => {
        const row = db.prepare('SELECT * FROM iso_contacts WHERE id = ?').get(Number(contactId) || 0);
        if (!row) throw fail(404, 'Contact not found.');
        const status = oneOf(input?.status, CONTACT_STATUSES, 'Contact status');
        db.prepare('UPDATE iso_contacts SET status=?, updated_at=? WHERE id=?').run(status, now, row.id);
        logActivity(row.organization_id, { type: 'contact_status_changed', actor, now, detail: { contactId: row.id, from: row.status, to: status } });
        record(row.organization_id, 'iso_contact_status_changed', actor, { contactId: row.id, before: row.status, after: status });
        touch(row.organization_id, now);
        rescore(row.organization_id, actor, { trigger: 'contact_status_changed', now });
        return row.organization_id;
      });
    },

    addEvidence(id, input, actor) {
      const now = clock();
      return tx(() => {
        requireOrg(id);
        const evidence = {
          category: oneOf(input?.category, EVIDENCE_CATEGORIES, 'Evidence category'),
          sourceType: oneOf(input?.sourceType, EVIDENCE_SOURCE_TYPES, 'Source type'),
          title: text(input?.title, { field: 'Title', max: 160 }),
          claim: text(input?.claim, { field: 'Claim', max: 500, required: true, multiline: true }),
          notes: text(input?.notes, { field: 'Analyst notes', max: 1000, multiline: true }),
          observedOn: isoDate(input?.observedOn, 'Observed date'),
          url: '',
        };
        if (evidence.observedOn && evidence.observedOn > today(now)) throw fail(422, 'Observed date cannot be in the future.');
        const rawUrl = text(input?.url, { field: 'Source URL', max: 300 });
        if (rawUrl) {
          evidence.url = normalizeSyntheticUrl(rawUrl);
          if (!evidence.url) throw fail(422, 'In demo mode a source URL must be http(s) on a reserved domain (example.com/.net/.org, .example, .test, .invalid). The URL is stored as a reference only and is never fetched.');
        }
        // New evidence always starts as an assertion. Confirmation is a separate, attributed review step.
        const evidenceId = insertEvidence(id, evidence, { actor, now });
        logActivity(id, { type: 'evidence_added', actor, now, detail: { evidenceId, category: evidence.category, sourceType: evidence.sourceType } });
        record(id, 'iso_evidence_added', actor, { evidenceId, category: evidence.category });
        touch(id, now);
        rescore(id, actor, { trigger: 'evidence_added', now });
        return evidenceId;
      });
    },

    reviewEvidence(evidenceId, input, actor) {
      const now = clock();
      return tx(() => {
        const row = db.prepare('SELECT * FROM iso_evidence WHERE id = ?').get(Number(evidenceId) || 0);
        if (!row) throw fail(404, 'Evidence item not found.');
        const status = oneOf(input?.status, EVIDENCE_STATUSES, 'Evidence status');
        if (status === 'asserted') throw fail(422, 'Evidence can only be reviewed as confirmed or refuted.');
        if (status === row.status) throw fail(422, 'Evidence already has that status.');
        const notes = text(input?.notes, { field: 'Review note', max: 1000, required: true, multiline: true });
        if (notes.length < 10) throw fail(422, 'Describe how this was checked (at least 10 characters).');
        const independent = text(input?.independentSource, { field: 'Independent source', max: 200 });
        // A self-reported or imported statement cannot confirm itself.
        if (status === 'confirmed' && ['self_reported', 'csv_import'].includes(row.source_type) && !independent) {
          throw fail(422, 'Name the independent source used to confirm this self-reported or imported statement.');
        }
        const combined = [row.notes, `[${now.slice(0, 10)} ${actor} -> ${status}] ${notes}${independent ? ` (independent source: ${independent})` : ''}`].filter(Boolean).join('\n').slice(0, 4000);
        db.prepare('UPDATE iso_evidence SET status=?, notes=?, reviewed_by=?, reviewed_at=? WHERE id=?').run(status, combined, actor, now, row.id);
        logActivity(row.organization_id, { type: 'evidence_reviewed', body: notes, actor, now, detail: { evidenceId: row.id, category: row.category, from: row.status, to: status } });
        record(row.organization_id, 'iso_evidence_reviewed', actor, { evidenceId: row.id, before: row.status, after: status });
        touch(row.organization_id, now);
        rescore(row.organization_id, actor, { trigger: 'evidence_reviewed', now });
        return row.organization_id;
      });
    },

    addActivity(id, input, actor) {
      const now = clock();
      return tx(() => {
        requireOrg(id);
        const type = input?.type;
        if (!['note', 'follow_up'].includes(type)) throw fail(422, 'Activity type must be "note" or "follow_up".');
        const body = text(input?.body, { field: 'Text', max: 1000, required: true, multiline: true });
        const dueOn = type === 'follow_up' ? isoDate(input?.dueOn, 'Due date', { required: true }) : null;
        const activityId = logActivity(id, { type, body, dueOn, actor, now });
        record(id, type === 'note' ? 'iso_note_added' : 'iso_follow_up_added', actor, { activityId, dueOn });
        touch(id, now);
        return activityId;
      });
    },

    completeFollowUp(activityId, actor) {
      const now = clock();
      return tx(() => {
        const row = db.prepare("SELECT * FROM iso_activity WHERE id = ? AND type = 'follow_up'").get(Number(activityId) || 0);
        if (!row) throw fail(404, 'Follow-up not found.');
        if (row.completed_at) throw fail(422, 'Follow-up is already completed.');
        db.prepare('UPDATE iso_activity SET completed_at=?, completed_by=? WHERE id=?').run(now, actor, row.id);
        record(row.organization_id, 'iso_follow_up_completed', actor, { activityId: row.id });
        touch(row.organization_id, now);
        return row.organization_id;
      });
    },

    recalculateScore(id, actor) {
      requireOrg(id);
      return rescore(id, actor, { trigger: 'manual_recalculate' });
    },

    /** Manual tier override. Evidence and the computed score are left untouched; the override is stored beside them. */
    overrideScore(id, input, actor) {
      const now = clock();
      return tx(() => {
        rescore(id, actor, { trigger: 'pre_override', now });
        const org = requireOrg(id);
        const tier = input?.tier;
        if (!ISO_TIERS.includes(tier)) throw fail(422, 'Override tier must be A, B, C or D.');
        const justification = text(input?.justification, { field: 'Justification', max: 500, multiline: true });
        if (justification.length < 10) throw fail(422, 'A justification of at least 10 characters is required for an override.');
        if (tier === org.tier && org.tierOverridden) throw fail(422, 'That override is already in place.');
        const base = lastComputed(id);
        db.prepare(`INSERT INTO iso_score_snapshots(organization_id,kind,rules_version,score,tier,effective_tier,factors_json,notes_json,inputs_digest,as_of,justification,actor,assessed_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'override', base.rules_version, base.score, base.tier, tier, base.factors_json, base.notes_json, base.inputs_digest, base.as_of, justification, actor, now);
        db.prepare('UPDATE iso_organizations SET override_tier=?, override_justification=?, override_by=?, override_at=?, updated_at=? WHERE id=?').run(tier, justification, actor, now, now, id);
        logActivity(id, { type: 'score_override', body: justification, actor, now, detail: { computedTier: base.tier, overrideTier: tier, score: base.score } });
        record(id, 'iso_score_overridden', actor, { computedTier: base.tier, overrideTier: tier, score: base.score });
        return requireOrg(id);
      });
    },

    clearScoreOverride(id, input, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(id);
        if (!org.tierOverridden) throw fail(422, 'There is no override to clear.');
        const justification = text(input?.justification, { field: 'Justification', max: 500, multiline: true });
        if (justification.length < 10) throw fail(422, 'A justification of at least 10 characters is required to clear an override.');
        rescore(id, actor, { trigger: 'pre_override_clear', now });
        const base = lastComputed(id);
        db.prepare(`INSERT INTO iso_score_snapshots(organization_id,kind,rules_version,score,tier,effective_tier,factors_json,notes_json,inputs_digest,as_of,justification,actor,assessed_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'override_cleared', base.rules_version, base.score, base.tier, base.tier, base.factors_json, base.notes_json, base.inputs_digest, base.as_of, justification, actor, now);
        db.prepare("UPDATE iso_organizations SET override_tier=NULL, override_justification='', override_by=NULL, override_at=NULL, updated_at=? WHERE id=?").run(now, id);
        logActivity(id, { type: 'score_override_cleared', body: justification, actor, now, detail: { previousOverrideTier: org.override.tier, computedTier: base.tier } });
        record(id, 'iso_score_override_cleared', actor, { previousOverrideTier: org.override.tier, computedTier: base.tier });
        return requireOrg(id);
      });
    },

    // CSV import -----------------------------------------------------------------
    /** Dry run: parse, map and classify every row without writing anything. */
    previewImport({ contentBase64, mapping: supplied }) {
      const csvText = decodeCsvUpload(contentBase64);
      const { headers, rows } = parseCsv(csvText);
      const mapping = resolveMapping(headers, supplied);
      const existing = db.prepare('SELECT id, created_at FROM iso_import_batches WHERE file_hash = ?').get(fileHash(csvText, mapping));
      const seenInFile = [];
      const preview = rows.map((cells, index) => {
        const checked = validateImportRow(cells, headers, mapping);
        const rowNumber = index + 2;
        if (!checked.ok) return { rowNumber, outcome: 'rejected', errors: checked.errors, organizationName: checked.redacted ? '[withheld]' : String(cells[headers.indexOf(mapping.organizationName)] ?? '').slice(0, 80) };
        const key = nameKey(checked.value.organizationName);
        let match = findMatches({ domain: checked.value.domain, key })[0];
        if (!match) {
          const earlier = seenInFile.find((s) => (checked.value.domain && s.domain === checked.value.domain) || s.key === key || isNearName(s.key, key));
          if (earlier) match = { matchType: checked.value.domain && earlier.domain === checked.value.domain ? 'exact_domain' : earlier.key === key ? 'exact_name' : 'near_name', rowNumber: earlier.rowNumber, displayName: earlier.name };
        }
        const replayed = Boolean(db.prepare('SELECT 1 FROM iso_import_rows WHERE row_hash = ? LIMIT 1').get(checked.rowHash));
        if (!match && !replayed) seenInFile.push({ domain: checked.value.domain, key, rowNumber, name: checked.value.organizationName });
        return { rowNumber, outcome: replayed ? 'replayed' : match ? 'duplicate_review' : 'accepted', organizationName: checked.value.organizationName, domain: checked.value.domain, match: match ?? null, errors: [] };
      });
      const count = (outcome) => preview.filter((row) => row.outcome === outcome).length;
      return {
        headers, mapping, fields: IMPORT_FIELDS.map(({ field, label, required }) => ({ field, label, required: Boolean(required) })), limits: IMPORT_LIMITS,
        alreadyImported: existing ? { batchId: existing.id, createdAt: existing.created_at } : null,
        summary: { totalRows: rows.length, accepted: count('accepted'), rejected: count('rejected'), duplicateReview: count('duplicate_review'), replayed: count('replayed') },
        rows: preview.slice(0, 100),
      };
    },

    /**
     * Commits an import in one transaction. Idempotent on the file: re-sending the same
     * file and mapping returns the original batch and creates nothing. Idempotent on
     * rows: a row already seen in an earlier batch is recorded as "replayed". Possible
     * duplicates are queued for human review and are never merged automatically.
     */
    commitImport({ filename, contentBase64, mapping: supplied }, actor) {
      const csvText = decodeCsvUpload(contentBase64);
      const { headers, rows } = parseCsv(csvText);
      const mapping = resolveMapping(headers, supplied);
      const hash = fileHash(csvText, mapping);
      const safeName = text(filename ?? 'import.csv', { field: 'Filename', max: 120 }).replace(/[^A-Za-z0-9._ -]/g, '_') || 'import.csv';
      const now = clock();
      return tx(() => {
        const prior = db.prepare('SELECT * FROM iso_import_batches WHERE file_hash = ?').get(hash);
        if (prior) {
          db.prepare('UPDATE iso_import_batches SET replay_count = replay_count + 1, last_replayed_at = ? WHERE id = ?').run(now, prior.id);
          audit({ actor, action: 'iso_import_replayed', detail: { batchId: prior.id, filename: safeName } });
          return { replayed: true, batch: batchFromRow(db.prepare('SELECT * FROM iso_import_batches WHERE id = ?').get(prior.id)) };
        }
        const batchId = newId('IMP');
        db.prepare(`INSERT INTO iso_import_batches(id,file_hash,filename,byte_size,mapping_json,status,total_rows,accepted_rows,rejected_rows,duplicate_rows,replayed_rows,created_by,created_at)
          VALUES(?,?,?,?,?,'completed',?,0,0,0,0,?,?)`).run(batchId, hash, safeName, Buffer.byteLength(csvText), JSON.stringify(mapping), rows.length, actor, now);
        const insertRow = db.prepare(`INSERT INTO iso_import_rows(batch_id,row_number,row_hash,status,data_json,errors_json,match_type,matched_organization_id,organization_id)
          VALUES(?,?,?,?,?,?,?,?,?)`);
        const counts = { accepted: 0, rejected: 0, duplicate_review: 0, replayed: 0 };
        const ctx = { actor, now };
        rows.forEach((cells, index) => {
          const rowNumber = index + 2;
          const checked = validateImportRow(cells, headers, mapping);
          if (!checked.ok) {
            // Raw values of a rejected row are not stored: the row may contain a real identity.
            counts.rejected += 1;
            insertRow.run(batchId, rowNumber, null, 'rejected', '{}', JSON.stringify(checked.errors), null, null, null);
            return;
          }
          const data = JSON.stringify(checked.value);
          if (db.prepare('SELECT 1 FROM iso_import_rows WHERE row_hash = ? LIMIT 1').get(checked.rowHash)) {
            counts.replayed += 1;
            insertRow.run(batchId, rowNumber, checked.rowHash, 'replayed', data, '[]', null, null, null);
            return;
          }
          // Rows accepted earlier in this file are already organizations, so in-file duplicates are caught here too.
          const match = findMatches({ domain: checked.value.domain, key: nameKey(checked.value.organizationName) })[0];
          if (match) {
            counts.duplicate_review += 1;
            insertRow.run(batchId, rowNumber, checked.rowHash, 'duplicate_review', data, '[]', match.matchType, match.organizationId, null);
            return;
          }
          const orgId = this._createFromImportRow(checked.value, batchId, ctx);
          counts.accepted += 1;
          insertRow.run(batchId, rowNumber, checked.rowHash, 'accepted', data, '[]', null, null, orgId);
        });
        db.prepare('UPDATE iso_import_batches SET accepted_rows=?, rejected_rows=?, duplicate_rows=?, replayed_rows=? WHERE id=?')
          .run(counts.accepted, counts.rejected, counts.duplicate_review, counts.replayed, batchId);
        audit({ actor, action: 'iso_import_committed', detail: { batchId, filename: safeName, totalRows: rows.length, ...counts } });
        return { replayed: false, batch: batchFromRow(db.prepare('SELECT * FROM iso_import_batches WHERE id = ?').get(batchId)) };
      });
    },

    _createFromImportRow(value, batchId, ctx) {
      const input = { displayName: value.organizationName, legalName: value.legalName, website: value.website, domain: value.domain, region: value.region,
        specializations: value.specializations, relationshipType: value.relationshipType, acquisitionSource: 'csv_import', importBatchId: batchId, stage: 'imported' };
      const orgId = insertOrganization(input, ctx);
      if (value.contactName || value.contactEmail || value.contactPhone) insertContact(orgId, { name: value.contactName, role: value.contactRole, email: value.contactEmail, phone: value.contactPhone }, ctx);
      seedAssertions(orgId, input, 'csv_import', ctx);
      rescore(orgId, 'system', { trigger: 'imported', now: ctx.now });
      record(orgId, 'iso_organization_imported', ctx.actor, { batchId });
      return orgId;
    },

    listImports() {
      return db.prepare('SELECT * FROM iso_import_batches ORDER BY created_at DESC, id DESC LIMIT 100').all().map(batchFromRow);
    },
    getImport(id) {
      const batch = batchFromRow(db.prepare('SELECT * FROM iso_import_batches WHERE id = ?').get(String(id)));
      if (!batch) throw fail(404, 'Import batch not found.');
      return { batch, rows: db.prepare('SELECT * FROM iso_import_rows WHERE batch_id = ? ORDER BY row_number LIMIT 500').all(batch.id).map(importRowFromRow) };
    },
    listDuplicateReviewQueue() {
      return db.prepare(`SELECT r.*, b.filename AS batch_filename, o.display_name AS matched_name, o.domain AS matched_domain
        FROM iso_import_rows r JOIN iso_import_batches b ON b.id = r.batch_id LEFT JOIN iso_organizations o ON o.id = r.matched_organization_id
        WHERE r.status = 'duplicate_review' ORDER BY r.id LIMIT 500`).all()
        .map((row) => ({ ...importRowFromRow(row), batchFilename: row.batch_filename, matchedName: row.matched_name, matchedDomain: row.matched_domain }));
    },

    /** A human decides what a possible duplicate is. Organization fields are never merged. */
    resolveImportRow(rowId, input, actor) {
      const now = clock();
      return tx(() => {
        const row = db.prepare('SELECT * FROM iso_import_rows WHERE id = ?').get(Number(rowId) || 0);
        if (!row) throw fail(404, 'Import row not found.');
        if (row.status !== 'duplicate_review') throw fail(422, 'This import row is not awaiting duplicate review.');
        const decision = input?.decision;
        if (!['create_separate', 'attach_contact', 'skip'].includes(decision)) throw fail(422, 'Decision must be create_separate, attach_contact or skip.');
        const note = text(input?.note, { field: 'Note', max: 500, multiline: true });
        if (note.length < 10) throw fail(422, 'Explain the decision (at least 10 characters).');
        const value = parse(row.data_json, {});
        const ctx = { actor, now };
        let status; let organizationId = null;
        if (decision === 'create_separate') {
          organizationId = this._createFromImportRow(value, row.batch_id, ctx);
          logActivity(organizationId, { type: 'duplicate_review', body: note, actor, now, detail: { decision, importRowId: row.id, reviewedAgainst: row.matched_organization_id, matchType: row.match_type } });
          status = 'resolved_created';
        } else if (decision === 'attach_contact') {
          if (!row.matched_organization_id) throw fail(422, 'No matched organization to attach a contact to.');
          if (!value.contactName && !value.contactEmail && !value.contactPhone) throw fail(422, 'This row has no contact details to attach.');
          organizationId = row.matched_organization_id;
          const contactId = insertContact(organizationId, { name: value.contactName, role: value.contactRole, email: value.contactEmail, phone: value.contactPhone }, ctx);
          logActivity(organizationId, { type: 'duplicate_review', body: note, actor, now, detail: { decision, importRowId: row.id, contactId, matchType: row.match_type } });
          touch(organizationId, now);
          rescore(organizationId, actor, { trigger: 'contact_added', now });
          status = 'resolved_contact_attached';
        } else {
          status = 'resolved_skipped';
          if (row.matched_organization_id) logActivity(row.matched_organization_id, { type: 'duplicate_review', body: note, actor, now, detail: { decision, importRowId: row.id, matchType: row.match_type } });
        }
        db.prepare('UPDATE iso_import_rows SET status=?, organization_id=?, resolved_by=?, resolved_at=?, resolution_note=? WHERE id=?').run(status, organizationId, actor, now, note, row.id);
        audit({ actor, action: 'iso_import_duplicate_resolved', isoOrgId: organizationId ?? row.matched_organization_id, detail: { importRowId: row.id, batchId: row.batch_id, decision, matchType: row.match_type } });
        return importRowFromRow(db.prepare('SELECT * FROM iso_import_rows WHERE id = ?').get(row.id));
      });
    },

    // Analytics --------------------------------------------------------------------
    /** Counts of what is actually stored. Metrics that cannot be measured yet are reported as null with a reason, never estimated. */
    analytics() {
      const group = (expr) => Object.fromEntries(db.prepare(`SELECT ${expr} AS k, COUNT(*) AS n FROM iso_organizations GROUP BY k`).all().map((row) => [row.k ?? 'unscored', Number(row.n)]));
      const one = (sql, ...params) => Number(db.prepare(sql).get(...params).n);
      const byStage = group('stage');
      const fill = (options, counts) => Object.fromEntries(options.map((key) => [key, counts[key] ?? 0]));
      return {
        generatedAt: clock(),
        syntheticOnly: true,
        totalOrganizations: one('SELECT COUNT(*) AS n FROM iso_organizations'),
        byStage: fill(values(ISO_STAGES), byStage),
        byTier: fill([...ISO_TIERS, 'unscored'], group('COALESCE(override_tier, tier)')),
        bySource: fill(values(ACQUISITION_SOURCES), group('acquisition_source')),
        byVerification: fill(values(VERIFICATION_STATUSES), group('verification_status')),
        reviewBacklog: REVIEW_BACKLOG_STAGES.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0),
        unassignedInBacklog: one(`SELECT COUNT(*) AS n FROM iso_organizations WHERE assigned_reviewer = '' AND stage IN (${REVIEW_BACKLOG_STAGES.map(() => '?').join(',')})`, ...REVIEW_BACKLOG_STAGES),
        outreachReady: byStage.outreach_ready ?? 0,
        tierOverrides: one('SELECT COUNT(*) AS n FROM iso_organizations WHERE override_tier IS NOT NULL'),
        evidence: {
          total: one('SELECT COUNT(*) AS n FROM iso_evidence'),
          asserted: one("SELECT COUNT(*) AS n FROM iso_evidence WHERE status = 'asserted'"),
          confirmed: one("SELECT COUNT(*) AS n FROM iso_evidence WHERE status = 'confirmed'"),
          refuted: one("SELECT COUNT(*) AS n FROM iso_evidence WHERE status = 'refuted'"),
        },
        followUps: {
          open: one("SELECT COUNT(*) AS n FROM iso_activity WHERE type = 'follow_up' AND completed_at IS NULL"),
          overdue: one("SELECT COUNT(*) AS n FROM iso_activity WHERE type = 'follow_up' AND completed_at IS NULL AND due_on < ?", today(clock())),
        },
        imports: {
          batches: one('SELECT COUNT(*) AS n FROM iso_import_batches'),
          rowsAccepted: one("SELECT COUNT(*) AS n FROM iso_import_rows WHERE status = 'accepted'"),
          rowsRejected: one("SELECT COUNT(*) AS n FROM iso_import_rows WHERE status = 'rejected'"),
          rowsReplayed: one("SELECT COUNT(*) AS n FROM iso_import_rows WHERE status = 'replayed'"),
          duplicateReviewPending: one("SELECT COUNT(*) AS n FROM iso_import_rows WHERE status = 'duplicate_review'"),
        },
        notMeasured: {
          responseToPartnershipConversion: null,
          outreachSent: null,
          reason: 'Outreach is not enabled in this build, so response and conversion rates do not exist yet. They are reported as no data rather than estimated.',
        },
      };
    },

    /** Organization-level export. Contact names, emails and phones are deliberately not included. */
    exportRows(query) {
      return this.listOrganizations(query).map((o) => ({
        id: o.id, displayName: o.displayName, domain: o.domain, region: o.region, relationshipType: o.relationshipType, specializations: o.specializations,
        acquisitionSource: o.acquisitionSource, stage: o.stage, verificationStatus: o.verificationStatus, score: o.score ?? '', computedTier: o.computedTier ?? '',
        effectiveTier: o.tier ?? '', tierOverridden: o.tierOverridden ? 'yes' : 'no', scoreRulesVersion: o.scoreRulesVersion ?? '', assignedReviewer: o.assignedReviewer,
        contactCount: o.contactCount, evidenceCount: o.evidenceCount, createdAt: o.createdAt, updatedAt: o.updatedAt,
      }));
    },
  };
}
