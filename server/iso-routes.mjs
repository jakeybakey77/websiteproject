// Authenticated ISO partner CRM API, mounted under /api/admin/iso/.
// The caller (app.mjs) has already required a valid admin session. Every
// state-changing request here must also carry the session's CSRF token.
import { csvCell } from '../public/js/lib/csv-export.js';
import { IMPORT_LIMITS } from './iso-csv.mjs';
import { CURRENT_RULES_VERSION, SCORE_RULES } from './iso-scoring.mjs';
import { applyHeaders, json, readJson } from './http-utils.mjs';
import { verifyCsrf } from './security.mjs';

const IMPORT_BODY_BYTES = Math.ceil(IMPORT_LIMITS.maxBytes / 3) * 4 + 16 * 1024;
const EXPORT_COLUMNS = ['id', 'displayName', 'domain', 'region', 'relationshipType', 'specializations', 'acquisitionSource', 'stage', 'verificationStatus',
  'score', 'computedTier', 'effectiveTier', 'tierOverridden', 'scoreRulesVersion', 'assignedReviewer', 'contactCount', 'evidenceCount', 'createdAt', 'updatedAt'];

export async function handleIsoAdmin({ req, res, path, url, session, db }) {
  const iso = db.iso;
  const referrals = db.referrals;
  const actor = session.username;
  const sub = path.slice('/api/admin/iso'.length) || '/';
  const get = req.method === 'GET';
  const post = req.method === 'POST';
  if (!get && !post) { json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' }); return true; }
  if (post && !verifyCsrf(req, session)) { json(res, 403, { error: 'Invalid CSRF token.' }); return true; }
  const body = (limit = 32 * 1024) => readJson(req, limit);
  const detail = (id) => ({ ...iso.getOrganizationDetail(id), audit: db.listAuditForIso(id) });
  let m;

  if (get && sub === '/organizations') {
    json(res, 200, { organizations: iso.listOrganizations(Object.fromEntries(url.searchParams)) });
  } else if (get && sub === '/analytics') {
    // Partner counts as before, plus referral counts for an optional ?from=&to= window.
    json(res, 200, { analytics: { ...iso.analytics(), referrals: db.referrals.analytics(Object.fromEntries(url.searchParams)) } });
  } else if (get && sub === '/score-rules') {
    json(res, 200, { currentVersion: CURRENT_RULES_VERSION, rules: SCORE_RULES[CURRENT_RULES_VERSION] });
  } else if (get && sub === '/export.csv') {
    const rows = iso.exportRows(Object.fromEntries(url.searchParams));
    const csv = [EXPORT_COLUMNS.map(csvCell).join(','), ...rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(','))].join('\r\n');
    db.audit({ actor, action: 'iso_export_downloaded', detail: { rows: rows.length, columns: EXPORT_COLUMNS.length, contactFieldsIncluded: false } });
    applyHeaders(res, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="gcp-demo-iso-partners.csv"' });
    res.statusCode = 200;
    res.end(csv);
  } else if (get && sub === '/imports') {
    json(res, 200, { imports: iso.listImports(), duplicateReview: iso.listDuplicateReviewQueue() });
  } else if (post && sub === '/imports/preview') {
    json(res, 200, { preview: iso.previewImport(await body(IMPORT_BODY_BYTES)) });
  } else if (post && sub === '/imports') {
    const result = iso.commitImport(await body(IMPORT_BODY_BYTES), actor);
    json(res, result.replayed ? 200 : 201, result);
  } else if (get && (m = sub.match(/^\/imports\/([^/]+)$/))) {
    json(res, 200, iso.getImport(m[1]));
  } else if (post && (m = sub.match(/^\/import-rows\/(\d+)\/resolve$/))) {
    json(res, 200, { row: iso.resolveImportRow(m[1], await body(), actor) });
  } else if (get && (m = sub.match(/^\/organizations\/([^/]+)\/referral-codes$/))) {
    json(res, 200, referrals.listCodes(m[1]));
  } else if (post && (m = sub.match(/^\/organizations\/([^/]+)\/referral-codes$/))) {
    await body();
    const result = referrals.issueCode(m[1], actor);
    json(res, result.created ? 201 : 200, result);
  } else if (post && (m = sub.match(/^\/organizations\/([^/]+)\/referral-codes\/rotate$/))) {
    json(res, 201, referrals.rotateCode(m[1], await body(), actor));
  } else if (post && (m = sub.match(/^\/referral-codes\/([^/]+)\/revoke$/))) {
    json(res, 200, referrals.revokeCode(m[1], await body(), actor));
  } else if (get && (m = sub.match(/^\/organizations\/([^/]+)\/referrals$/))) {
    json(res, 200, referrals.listForOrganization(m[1], Object.fromEntries(url.searchParams)));
  } else if (get && (m = sub.match(/^\/organizations\/([^/]+)$/))) {
    json(res, 200, detail(m[1]));
  } else if (post && (m = sub.match(/^\/organizations\/([^/]+)\/(stage|verification|assign|contacts|evidence|activities|score\/recalculate|score\/override|score\/override\/clear)$/))) {
    const id = m[1];
    const input = await body();
    let extra = {};
    switch (m[2]) {
      case 'stage': iso.changeStage(id, input, actor); break;
      case 'verification': iso.changeVerification(id, input, actor); break;
      case 'assign': iso.assignReviewer(id, input, actor); break;
      case 'contacts': extra = { contactId: iso.addContact(id, input, actor) }; break;
      case 'evidence': extra = { evidenceId: iso.addEvidence(id, input, actor) }; break;
      case 'activities': extra = { activityId: iso.addActivity(id, input, actor) }; break;
      case 'score/recalculate': extra = { scoreChanged: iso.recalculateScore(id, actor).changed }; break;
      case 'score/override': iso.overrideScore(id, input, actor); break;
      default: iso.clearScoreOverride(id, input, actor);
    }
    json(res, ['contacts', 'evidence', 'activities'].includes(m[2]) ? 201 : 200, { ...extra, ...detail(id) });
  } else if (post && (m = sub.match(/^\/evidence\/(\d+)\/review$/))) {
    json(res, 200, detail(iso.reviewEvidence(m[1], await body(), actor)));
  } else if (post && (m = sub.match(/^\/contacts\/(\d+)\/status$/))) {
    json(res, 200, detail(iso.setContactStatus(m[1], await body(), actor)));
  } else if (post && (m = sub.match(/^\/activities\/(\d+)\/complete$/))) {
    json(res, 200, detail(iso.completeFollowUp(m[1], actor)));
  } else {
    json(res, 404, { error: 'Not found.' });
  }
  return true;
}
