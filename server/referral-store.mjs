// ISO referral tracking (v2.3): demo referral links, the single effective partner
// credit on a merchant inquiry, its append-only history, idempotent public
// submission, and counts derived from stored records.
//
// Boundaries this module keeps:
//   - It reads only identity, stage and verification status from the partner record.
//     Partner scores, tiers, evidence and contacts are never read here, so they can
//     never influence a merchant inquiry.
//   - It never changes a merchant's stage or screening result.
//   - A referral code is an attribution marker, not a credential. Its value is never
//     written to the audit log or the partner timeline; those carry the record id only.
import { createHash, randomBytes } from 'node:crypto';
import { STAGES as MERCHANT_STAGES } from '../public/js/config/pipeline.js';
import { REFERRAL_CODE_PREFIX, isWellFormedReferralCode, isWellFormedSubmissionId, referralPath } from '../public/js/lib/referral-code.js';

const fail = (statusCode, message, errorCode) => Object.assign(new Error(message), { statusCode, ...(errorCode ? { errorCode } : {}) });
const newId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

export const STAGE_CHANGE_REVOKE_REASON = 'partner_stage_changed';
export const PUBLIC_CODE_REASON = 'public_referral_code';
const MAX_PAGE_SIZE = 100;
const MERCHANT_STAGE_VALUES = MERCHANT_STAGES.map((stage) => stage.value);

/** 18 random bytes = 144 bits, base64url. Never sequential, never derived from an ISO id. */
export const generateReferralCode = () => `${REFERRAL_CODE_PREFIX}${randomBytes(18).toString('base64url')}`;

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
};

/**
 * Deterministic digest of the validated request an idempotency key is bound to:
 * identity, normalized answers, normalized UTM values and the referral code (or null).
 * The submission key itself and all timestamps are excluded.
 */
export function inquiryDigest(validated) {
  const { contactName, businessName, email, phone } = validated.identity;
  return createHash('sha256').update(canonical({
    identity: { contactName, businessName, email, phone },
    answers: validated.answers,
    attribution: validated.attribution,
    referralCode: validated.referralCode ?? null,
  })).digest('hex');
}

/** A written reason: at least 10 non-whitespace characters, single block of text. */
function reasonText(value, label = 'Reason') {
  if (typeof value !== 'string') throw fail(422, `${label} is required (at least 10 characters).`);
  const cleaned = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  if (cleaned.replace(/\s/g, '').length < 10) throw fail(422, `${label} must be at least 10 characters.`);
  if (cleaned.length > 500) throw fail(422, `${label} must be at most 500 characters.`);
  return cleaned;
}

const isEligible = (org) => org.stage === 'active_partner' && org.verification_status === 'verified';
const INELIGIBLE = 'Referral links and referral credit are only available while the organization is an active partner with verified business status.';
const UNAVAILABLE = 'This referral link is not available. Remove the referral code to continue as a direct demo inquiry.';

function dayBounds(query = {}) {
  const day = (value, label) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw fail(422, `${label} must be a valid date (YYYY-MM-DD).`);
    return value;
  };
  const from = day(query.from, 'from');
  const to = day(query.to, 'to');
  if (from && to && from > to) throw fail(422, 'from must not be after to.');
  const where = [];
  const params = [];
  if (from) { where.push('l.received_at >= ?'); params.push(`${from}T00:00:00.000Z`); }
  if (to) { where.push('l.received_at < ?'); params.push(new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString()); }
  return { window: { from, to, basis: 'leads.received_at (UTC), both days inclusive' }, where, params };
}

export function createReferralStore(db, { audit, tx, insertLead, getLead, recordIsoActivity, publicBaseUrl = '' }) {
  const clock = () => new Date().toISOString();
  const count = (sql, ...params) => Number(db.prepare(sql).get(...params).n);

  const orgRow = (id) => db.prepare('SELECT id, display_name, stage, verification_status FROM iso_organizations WHERE id = ?').get(String(id));
  function requireOrg(id) {
    const org = orgRow(id);
    if (!org) throw fail(404, 'ISO organization not found.');
    return org;
  }
  const eligibilityOf = (org) => ({
    eligible: isEligible(org), stage: org.stage, verificationStatus: org.verification_status,
    rule: 'stage = active_partner AND verification = verified (partner score and tier are not considered)',
  });

  // Referral codes --------------------------------------------------------------
  const codeRow = (id) => db.prepare('SELECT * FROM iso_referral_codes WHERE id = ?').get(String(id));
  const activeCodeRow = (orgId) => db.prepare("SELECT * FROM iso_referral_codes WHERE iso_organization_id = ? AND status = 'active'").get(orgId);
  // Absolute only when a vetted origin is configured; never built from request headers.
  const urlFor = (code) => `${publicBaseUrl}${referralPath(code)}`;
  const codeView = (row) => row && ({
    id: row.id, organizationId: row.iso_organization_id, status: row.status, code: row.code,
    referralUrl: row.status === 'active' ? urlFor(row.code) : null, demo: true,
    createdBy: row.created_by, createdAt: row.created_at, revokedBy: row.revoked_by, revokedAt: row.revoked_at, revokeReason: row.revoke_reason,
  });

  function insertCode(orgId, actor, now) {
    const id = newId('RC');
    db.prepare("INSERT INTO iso_referral_codes(id,iso_organization_id,code,status,created_by,created_at) VALUES(?,?,?,'active',?,?)")
      .run(id, orgId, generateReferralCode(), actor, now);
    return id;
  }
  function markRevoked(row, { revokedBy, reason, now }) {
    db.prepare("UPDATE iso_referral_codes SET status='revoked', revoked_by=?, revoked_at=?, revoke_reason=? WHERE id=? AND status='active'").run(revokedBy, now, reason, row.id);
  }

  // Effective credit and history ------------------------------------------------
  const creditRow = (leadId) => db.prepare(`SELECT r.*, o.display_name FROM lead_referrals r JOIN iso_organizations o ON o.id = r.iso_organization_id WHERE r.lead_id = ?`).get(leadId);
  const createdEvent = (leadId) => db.prepare(`SELECT e.*, o.display_name FROM lead_referral_events e JOIN iso_organizations o ON o.id = e.new_iso_id
    WHERE e.lead_id = ? AND e.event_type = 'created'`).get(leadId);
  function appendEvent({ leadId, oldIsoId = null, newIsoId = null, referralCodeId = null, eventType, actor, reason, requestId = null, now }) {
    return Number(db.prepare(`INSERT INTO lead_referral_events(lead_id,old_iso_id,new_iso_id,referral_code_id,event_type,actor,reason,request_id,at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(leadId, oldIsoId, newIsoId, referralCodeId, eventType, actor, reason, requestId, now).lastInsertRowid);
  }

  function leadReferralView(leadId) {
    const current = creditRow(leadId);
    const original = createdEvent(leadId);
    const history = db.prepare(`SELECT e.*, old.display_name AS old_name, new.display_name AS new_name FROM lead_referral_events e
      LEFT JOIN iso_organizations old ON old.id = e.old_iso_id LEFT JOIN iso_organizations new ON new.id = e.new_iso_id
      WHERE e.lead_id = ? ORDER BY e.id LIMIT 500`).all(leadId);
    return {
      leadId,
      syntheticOnly: true,
      current: current ? {
        isoOrganizationId: current.iso_organization_id, isoDisplayName: current.display_name, method: current.method, referralCodeId: current.referral_code_id,
        firstAttributedAt: current.first_attributed_at, updatedAt: current.updated_at, updatedBy: current.updated_by,
      } : null,
      original: original ? { isoOrganizationId: original.new_iso_id, isoDisplayName: original.display_name, referralCodeId: original.referral_code_id, method: 'public_code', at: original.at } : null,
      history: history.map((e) => ({
        id: e.id, eventType: e.event_type, oldIsoOrganizationId: e.old_iso_id, oldIsoDisplayName: e.old_name, newIsoOrganizationId: e.new_iso_id, newIsoDisplayName: e.new_name,
        referralCodeId: e.referral_code_id, actor: e.actor, reason: e.reason, at: e.at,
      })),
    };
  }

  // Analytics helpers -----------------------------------------------------------
  const stageBreakdown = (rows) => Object.fromEntries(MERCHANT_STAGE_VALUES.map((stage) => [stage, Number(rows.find((row) => row.stage === stage)?.n ?? 0)]));
  const share = (part, total) => (total > 0 ? part / total : null);
  const and = (clauses) => (clauses.length ? ` AND ${clauses.join(' AND ')}` : '');
  const METRIC_NOTES = Object.freeze({
    basis: 'Current effective attribution by submission date. Corrections change these counts; original credit stays in each inquiry\'s history.',
    reviewReadyCount: 'Inquiries currently in "ready_for_handoff". Not an approval.',
    simulatedHandoffCount: 'Inquiries currently in "handed_off" (simulated). Not a real submission and not funded.',
    partnerShareOfSubmissions: 'Credited inquiries / all merchant inquiries in the same window. null means no data.',
  });
  const NOT_MEASURED = Object.freeze({
    clicks: null, clickToInquiryConversion: null, qualifiedRate: null, closeRate: null, fundedAmount: null, revenue: null, commissions: null,
    reason: 'Link clicks and financing outcomes are not recorded in this build, so these are reported as no data rather than estimated.',
  });

  function organizationMetrics(orgId, bounds) {
    const total = count(`SELECT COUNT(*) AS n FROM leads l WHERE 1=1${and(bounds.where)}`, ...bounds.params);
    const stages = db.prepare(`SELECT l.stage AS stage, COUNT(*) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id
      WHERE r.iso_organization_id = ?${and(bounds.where)} GROUP BY l.stage`).all(orgId, ...bounds.params);
    const breakdown = stageBreakdown(stages);
    const attributed = stages.reduce((sum, row) => sum + Number(row.n), 0);
    const byDay = db.prepare(`SELECT substr(l.received_at, 1, 10) AS day, COUNT(*) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id
      WHERE r.iso_organization_id = ?${and(bounds.where)} GROUP BY day ORDER BY day DESC LIMIT 366`).all(orgId, ...bounds.params);
    return {
      attributedInquiries: attributed,
      totalMerchantInquiries: total,
      partnerShareOfSubmissions: share(attributed, total),
      merchantStageBreakdown: breakdown,
      reviewReadyCount: breakdown.ready_for_handoff,
      simulatedHandoffCount: breakdown.handed_off,
      newReferralsByDay: byDay.reverse().map((row) => ({ date: row.day, count: Number(row.n) })),
    };
  }

  return {
    eligibility: (orgId) => eligibilityOf(requireOrg(orgId)),

    /** Issuance history for one organization. Admin-only: this is the one place a code value is shown. */
    listCodes(orgId) {
      const org = requireOrg(orgId);
      const rows = db.prepare('SELECT * FROM iso_referral_codes WHERE iso_organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 200').all(org.id);
      return {
        organizationId: org.id, syntheticOnly: true, eligibility: eligibilityOf(org),
        activeCode: codeView(rows.find((row) => row.status === 'active')) ?? null,
        codes: rows.map(codeView),
      };
    },

    /** Admin-initiated only. Returns the existing active code unchanged when there is one. */
    issueCode(orgId, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(orgId);
        if (!isEligible(org)) throw fail(422, INELIGIBLE);
        const existing = activeCodeRow(org.id);
        if (existing) return { created: false, code: codeView(existing) };
        const id = insertCode(org.id, actor, now);
        recordIsoActivity(org.id, { type: 'referral_code_issued', actor, now, detail: { referralCodeId: id } });
        audit({ actor, action: 'iso_referral_code_issued', isoOrgId: org.id, detail: { referralCodeId: id } });
        return { created: true, code: codeView(codeRow(id)) };
      });
    },

    revokeCode(codeId, input, actor) {
      const now = clock();
      return tx(() => {
        const row = codeRow(codeId);
        if (!row) throw fail(404, 'Referral code not found.');
        const reason = reasonText(input?.reason, 'Revocation reason');
        if (row.status === 'revoked') return { revoked: false, code: codeView(row) };
        markRevoked(row, { revokedBy: actor, reason, now });
        recordIsoActivity(row.iso_organization_id, { type: 'referral_code_revoked', body: reason, actor, now, detail: { referralCodeId: row.id } });
        audit({ actor, action: 'iso_referral_code_revoked', isoOrgId: row.iso_organization_id, detail: { referralCodeId: row.id, reason } });
        return { revoked: true, code: codeView(codeRow(row.id)) };
      });
    },

    /** Revoke the active code and issue a fresh one in a single transaction. The old link stays dead. */
    rotateCode(orgId, input, actor) {
      const now = clock();
      return tx(() => {
        const org = requireOrg(orgId);
        const reason = reasonText(input?.reason, 'Rotation reason');
        if (!isEligible(org)) throw fail(422, INELIGIBLE);
        const existing = activeCodeRow(org.id);
        if (!existing) throw fail(422, 'There is no active referral link to rotate. Issue one instead.');
        markRevoked(existing, { revokedBy: actor, reason, now });
        const id = insertCode(org.id, actor, now);
        recordIsoActivity(org.id, { type: 'referral_code_rotated', body: reason, actor, now, detail: { revokedCodeId: existing.id, referralCodeId: id } });
        audit({ actor, action: 'iso_referral_code_rotated', isoOrgId: org.id, detail: { revokedCodeId: existing.id, referralCodeId: id, reason } });
        return { rotated: true, revoked: codeView(codeRow(existing.id)), code: codeView(codeRow(id)) };
      });
    },

    /** Called by the ISO store from inside its stage-change transaction. Never opens its own. */
    revokeForStageChange({ organizationId, actor, now, stageBefore, stageAfter }) {
      return tx(() => {
        const rows = db.prepare("SELECT * FROM iso_referral_codes WHERE iso_organization_id = ? AND status = 'active'").all(organizationId);
        const revokedBy = `system:${actor}`;
        for (const row of rows) {
          markRevoked(row, { revokedBy, reason: STAGE_CHANGE_REVOKE_REASON, now });
          recordIsoActivity(organizationId, { type: 'referral_code_revoked', body: STAGE_CHANGE_REVOKE_REASON, actor: revokedBy, now, detail: { referralCodeId: row.id, stageBefore, stageAfter } });
          audit({ actor: revokedBy, action: 'iso_referral_code_revoked', isoOrgId: organizationId, detail: { referralCodeId: row.id, reason: STAGE_CHANGE_REVOKE_REASON, stageBefore, stageAfter } });
        }
        return rows.length;
      });
    },

    /**
     * Stores a validated public inquiry. Lead, referral credit, history event, submission
     * key and audit rows commit together or not at all.
     *
     * The submission key is checked before the referral code, so a transport retry of an
     * inquiry that already committed gets its original receipt even if the link has been
     * revoked since. A new submission is authorized only by the state committed right now.
     */
    submitInquiry({ lead, referralCode = null, submissionId = null, digest }) {
      if (referralCode != null && !isWellFormedReferralCode(referralCode)) throw fail(422, UNAVAILABLE, 'referral_unavailable');
      if (submissionId != null && !isWellFormedSubmissionId(submissionId)) throw fail(422, 'submissionId must be a UUID or a random string of 16 to 64 characters.');
      const now = clock();
      return tx(() => {
        if (submissionId) {
          const prior = db.prepare('SELECT * FROM lead_submission_keys WHERE submission_key = ?').get(submissionId);
          if (prior) {
            if (prior.payload_digest !== digest) throw fail(409, 'This submission was already received with different details. Start a new submission to send changes.', 'submission_conflict');
            return { replayed: true, lead: getLead(prior.lead_id), referred: Boolean(createdEvent(prior.lead_id)) };
          }
        }
        let credit = null;
        if (referralCode) {
          // Exact, case-sensitive match on the unique index; eligibility is read in this transaction.
          credit = db.prepare(`SELECT c.id, c.status, c.iso_organization_id, o.stage, o.verification_status FROM iso_referral_codes c
            JOIN iso_organizations o ON o.id = c.iso_organization_id WHERE c.code = ?`).get(referralCode);
          if (!credit || credit.status !== 'active' || !isEligible(credit)) throw fail(422, UNAVAILABLE, 'referral_unavailable');
        }
        if (getLead(lead.id)) throw fail(500, 'Inquiry id collision.');
        const stored = insertLead(lead);
        if (credit) {
          db.prepare(`INSERT INTO lead_referrals(lead_id,iso_organization_id,referral_code_id,method,first_attributed_at,updated_at,updated_by) VALUES(?,?,?,'public_code',?,?,'public-demo')`)
            .run(stored.id, credit.iso_organization_id, credit.id, now, now);
          appendEvent({ leadId: stored.id, newIsoId: credit.iso_organization_id, referralCodeId: credit.id, eventType: 'created', actor: 'public-demo', reason: PUBLIC_CODE_REASON, now });
        }
        if (submissionId) db.prepare('INSERT INTO lead_submission_keys(submission_key,payload_digest,lead_id,created_at) VALUES(?,?,?,?)').run(submissionId, digest, stored.id, now);
        audit({ actor: 'public-demo', action: 'demo_inquiry_created', leadId: stored.id, detail: { source: stored.source, medium: stored.medium, campaign: stored.campaign, referred: Boolean(credit) } });
        if (credit) audit({ actor: 'public-demo', action: 'lead_referral_created', leadId: stored.id, isoOrgId: credit.iso_organization_id, detail: { referralCodeId: credit.id, method: 'public_code' } });
        return { replayed: false, lead: stored, referred: Boolean(credit) };
      });
    },

    /** lead id -> safe summary of the current effective credit, for the merchant list. */
    leadSummaries() {
      const rows = db.prepare(`SELECT r.lead_id, r.iso_organization_id, r.method, r.first_attributed_at, o.display_name
        FROM lead_referrals r JOIN iso_organizations o ON o.id = r.iso_organization_id`).all();
      return new Map(rows.map((row) => [row.lead_id, { isoOrganizationId: row.iso_organization_id, isoDisplayName: row.display_name, method: row.method, attributedAt: row.first_attributed_at }]));
    },

    getLeadReferral(leadId) {
      if (!getLead(leadId)) throw fail(404, 'Inquiry not found.');
      return leadReferralView(leadId);
    },

    /**
     * Reasoned, audited manual correction: assign, reassign or remove the effective credit.
     * History is appended, never rewritten; the original public-code event stays as it was.
     */
    correctLeadReferral(leadId, input, actor) {
      const now = clock();
      return tx(() => {
        const lead = getLead(leadId);
        if (!lead) throw fail(404, 'Inquiry not found.');
        if (lead.demo !== true) throw fail(403, 'This MVP only permits attribution changes on demo inquiries.');
        if (!input || typeof input !== 'object' || !('isoOrganizationId' in input)) throw fail(422, 'isoOrganizationId is required: an ISO organization id, or null to remove attribution.');
        const targetId = input.isoOrganizationId;
        if (targetId !== null && (typeof targetId !== 'string' || !targetId)) throw fail(422, 'isoOrganizationId must be an ISO organization id, or null to remove attribution.');
        const reason = reasonText(input.reason);
        const requestId = input.requestId ?? null;
        if (requestId !== null && !isWellFormedSubmissionId(requestId)) throw fail(422, 'requestId must be a UUID or a random string of 16 to 64 characters.');
        if (requestId && db.prepare('SELECT 1 FROM lead_referral_events WHERE lead_id = ? AND request_id = ?').get(lead.id, requestId)) {
          return { changed: false, replayed: true, ...leadReferralView(lead.id) };
        }
        const current = creditRow(lead.id);
        const currentId = current?.iso_organization_id ?? null;
        if (targetId === currentId) return { changed: false, ...leadReferralView(lead.id) };

        let eventId;
        if (targetId === null) {
          // Removal is allowed whatever the old partner's status is now.
          db.prepare('DELETE FROM lead_referrals WHERE lead_id = ?').run(lead.id);
          eventId = appendEvent({ leadId: lead.id, oldIsoId: currentId, eventType: 'removed', actor, reason, requestId, now });
        } else {
          const target = orgRow(targetId);
          if (!target) throw fail(422, 'The selected ISO organization does not exist.');
          if (!isEligible(target)) throw fail(422, INELIGIBLE);
          if (current) {
            db.prepare("UPDATE lead_referrals SET iso_organization_id=?, referral_code_id=NULL, method='manual', updated_at=?, updated_by=? WHERE lead_id=?").run(target.id, now, actor, lead.id);
          } else {
            const first = db.prepare('SELECT MIN(at) AS at FROM lead_referral_events WHERE lead_id = ? AND new_iso_id IS NOT NULL').get(lead.id).at ?? now;
            db.prepare("INSERT INTO lead_referrals(lead_id,iso_organization_id,referral_code_id,method,first_attributed_at,updated_at,updated_by) VALUES(?,?,NULL,'manual',?,?,?)").run(lead.id, target.id, first, now, actor);
          }
          eventId = appendEvent({ leadId: lead.id, oldIsoId: currentId, newIsoId: target.id, eventType: 'corrected', actor, reason, requestId, now });
        }
        const action = targetId === null ? 'lead_referral_removed' : 'lead_referral_corrected';
        const detail = { eventId, oldIsoOrganizationId: currentId, newIsoOrganizationId: targetId, reason };
        // One audit row per affected partner, so each partner's own audit trail shows the change.
        for (const isoOrgId of [...new Set([currentId, targetId].filter(Boolean))]) audit({ actor, action, leadId: lead.id, isoOrgId, detail });
        return { changed: true, ...leadReferralView(lead.id) };
      });
    },

    /** Inquiries currently credited to one partner. Ids, dates and merchant stages only: no merchant contact fields. */
    listForOrganization(orgId, query = {}) {
      const org = requireOrg(orgId);
      const whole = (value, fallback) => { const n = Number.parseInt(value ?? '', 10); return Number.isFinite(n) && n > 0 ? n : fallback; };
      const pageSize = Math.min(MAX_PAGE_SIZE, whole(query.pageSize, 25));
      const page = whole(query.page, 1);
      const bounds = dayBounds(query);
      const total = count(`SELECT COUNT(*) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id WHERE r.iso_organization_id = ?${and(bounds.where)}`, org.id, ...bounds.params);
      const items = db.prepare(`SELECT l.id, l.received_at, l.stage, r.method, r.first_attributed_at FROM lead_referrals r JOIN leads l ON l.id = r.lead_id
        WHERE r.iso_organization_id = ?${and(bounds.where)} ORDER BY l.received_at DESC, l.id DESC LIMIT ? OFFSET ?`).all(org.id, ...bounds.params, pageSize, (page - 1) * pageSize);
      return {
        organizationId: org.id, syntheticOnly: true, window: bounds.window, page, pageSize, total,
        items: items.map((row) => ({ leadId: row.id, receivedAt: row.received_at, merchantStage: row.stage, method: row.method, attributedAt: row.first_attributed_at })),
        summary: organizationMetrics(org.id, bounds),
        notes: METRIC_NOTES,
        notMeasured: NOT_MEASURED,
      };
    },

    /** Counts of stored synthetic records only, computed in SQL. Nothing is estimated. */
    analytics(query = {}) {
      const bounds = dayBounds(query);
      const whereAll = `WHERE 1=1${and(bounds.where)}`;
      const total = count(`SELECT COUNT(*) AS n FROM leads l ${whereAll}`, ...bounds.params);
      const referred = count(`SELECT COUNT(*) AS n FROM leads l JOIN lead_referrals r ON r.lead_id = l.id ${whereAll}`, ...bounds.params);
      const organizationsWithCredit = count(`SELECT COUNT(DISTINCT r.iso_organization_id) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id ${whereAll}`, ...bounds.params);
      const top = db.prepare(`SELECT r.iso_organization_id AS id, o.display_name AS name, COUNT(*) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id
        JOIN iso_organizations o ON o.id = r.iso_organization_id ${whereAll} GROUP BY r.iso_organization_id ORDER BY n DESC, r.iso_organization_id LIMIT ${MAX_PAGE_SIZE}`).all(...bounds.params);
      const stageRows = top.length ? db.prepare(`SELECT r.iso_organization_id AS id, l.stage AS stage, COUNT(*) AS n FROM lead_referrals r JOIN leads l ON l.id = r.lead_id
        ${whereAll} AND r.iso_organization_id IN (${top.map(() => '?').join(',')}) GROUP BY r.iso_organization_id, l.stage`).all(...bounds.params, ...top.map((row) => row.id)) : [];
      return {
        syntheticOnly: true,
        label: 'Synthetic demonstration data',
        window: bounds.window,
        totalMerchantInquiries: total,
        referredInquiries: referred,
        directOrUnattributedInquiries: total - referred,
        organizationsWithCredit,
        attributedInquiriesByIso: top.map((row) => {
          const breakdown = stageBreakdown(stageRows.filter((stage) => stage.id === row.id));
          return {
            isoOrganizationId: row.id, isoDisplayName: row.name, attributedInquiries: Number(row.n), partnerShareOfSubmissions: share(Number(row.n), total),
            merchantStageBreakdown: breakdown, reviewReadyCount: breakdown.ready_for_handoff, simulatedHandoffCount: breakdown.handed_off,
          };
        }),
        activeReferralCodes: count("SELECT COUNT(*) AS n FROM iso_referral_codes WHERE status = 'active'"),
        notes: METRIC_NOTES,
        notMeasured: NOT_MEASURED,
      };
    },
  };
}
