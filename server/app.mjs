import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { applyDemoReview } from '../public/js/lib/review-workflow.js';
import { evaluateLead } from '../public/js/lib/validation-engine.js';
import { validationRules } from '../public/js/config/validation-rules.js';
import { openDatabase } from './db.mjs';
import { createLeadFromInquiry, validateInquiryPayload } from './inquiry.mjs';
import { validateIsoApplication } from './iso-application.mjs';
import { handleIsoAdmin } from './iso-routes.mjs';
import { inquiryDigest } from './referral-store.mjs';
import {
  clearSessionCookie,
  destroySession,
  getSessionFromRequest,
  issueSession,
  passwordMatches,
  sessionCookie,
  verifyCsrf,
} from './security.mjs';
import { applyHeaders, json, readJson, redirect, serveStatic, text } from './http-utils.mjs';

const publicRoot = fileURLToPath(new URL('../public', import.meta.url));

function rateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    current.count += 1;
    if (current.count > limit) return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
    return { allowed: true, remaining: limit - current.count };
  };
}

const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
};

const withValidation = (lead) => ({ ...lead, validation: evaluateLead(lead, validationRules) });

// What the applicant gets back. A replayed submission returns this same receipt, so the
// review state is pinned to its values at submission time: a retry can never be used to
// read a reviewer's later stage change or notes. No partner identity, score or contact.
const inquiryReceipt = (lead, referred) => ({
  ...lead,
  stage: 'new', followUpReason: '', lastReviewNote: '', reviewedAt: null, reviewHistory: [], workflowMilestones: {}, updatedAt: lead.createdAt,
  referralAttribution: { recorded: referred },
});

export function createApp(options) {
  const cfg = options.config;
  const db = options.db ?? openDatabase(cfg.dbPath, { seed: cfg.seedSampleLeads, publicBaseUrl: cfg.publicBaseUrl ?? '' });
  const loginLimit = rateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
  const inquiryLimit = rateLimiter({ limit: 40, windowMs: 10 * 60 * 1000 });
  const isoApplicationLimit = rateLimiter({ limit: 40, windowMs: 10 * 60 * 1000 });

  async function handler(req, res) {
    // A malformed request target (for example a stray "%") must produce a 400, not an
    // unhandled rejection that takes the whole process down.
    let url;
    let path;
    try {
      url = new URL(req.url, 'http://localhost');
      path = decodeURIComponent(url.pathname);
    } catch {
      json(res, 400, { error: 'Malformed request URL.' });
      return;
    }

    try {
      if (req.method === 'GET' && path === '/healthz') {
        let dbOk = false;
        try { dbOk = db.ping(); } catch { dbOk = false; }
        json(res, dbOk ? 200 : 503, { ok: dbOk, demoMode: cfg.demoMode });
        return;
      }

      // Public ISO / referral-partner demo application. Separate endpoint, schema and
      // tables from the merchant inquiry below; accepts built-in fictional partner
      // identities only, and is closed (not opened to real data) when demo mode is off.
      if (req.method === 'POST' && path === '/api/iso/applications') {
        const rate = isoApplicationLimit(clientIp(req));
        if (!rate.allowed) {
          json(res, 429, { error: 'Too many demo submissions. Try again later.' }, { 'Retry-After': String(rate.retryAfter) });
          return;
        }
        if (!cfg.demoMode) {
          json(res, 503, { error: 'Live collection is disabled until compliance and security review is complete.' });
          return;
        }
        const validated = validateIsoApplication(await readJson(req, cfg.maxBodyBytes));
        const organization = db.iso.createFromApplication(validated);
        // The applicant gets a receipt only: no score, tier or internal review state.
        json(res, 201, {
          reference: organization.id,
          organizationName: organization.displayName,
          receivedAt: organization.createdAt,
          demo: true,
          status: 'received_for_manual_review',
        });
        return;
      }

      // Public inquiry endpoint. The shipped front end remains demo-only and only
      // accepts the built-in fictional identities.
      if (req.method === 'POST' && path === '/api/inquiries') {
        const rate = inquiryLimit(clientIp(req));
        if (!rate.allowed) {
          json(res, 429, { error: 'Too many demo submissions. Try again later.' }, { 'Retry-After': String(rate.retryAfter) });
          return;
        }
        if (!cfg.demoMode) {
          json(res, 503, { error: 'Live collection is disabled until compliance and security review is complete.' });
          return;
        }
        const payload = await readJson(req, cfg.maxBodyBytes);
        const validated = validateInquiryPayload(payload, { demoMode: true });
        // Lead, referral credit, history, submission key and audit commit in one transaction.
        // An unknown or revoked code, or a partner that is no longer eligible, stores nothing.
        const result = db.referrals.submitInquiry({
          lead: createLeadFromInquiry(validated, { demoMode: true }),
          referralCode: validated.referralCode,
          submissionId: validated.submissionId,
          digest: inquiryDigest(validated),
        });
        json(res, result.replayed ? 200 : 201, inquiryReceipt(result.lead, result.referred), result.replayed ? { 'Idempotent-Replay': 'true' } : {});
        return;
      }

      // Authentication ------------------------------------------------------
      if (req.method === 'POST' && path === '/api/auth/login') {
        const rate = loginLimit(clientIp(req));
        if (!rate.allowed) {
          json(res, 429, { error: 'Too many login attempts. Try again later.' }, { 'Retry-After': String(rate.retryAfter) });
          return;
        }
        const body = await readJson(req, 16 * 1024);
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const validUser = username === cfg.adminUsername;
        const validPassword = passwordMatches(password, cfg.adminPassword, cfg.sessionSecret);
        if (!validUser || !validPassword) {
          db.audit({ actor: username || 'unknown', action: 'login_failed', detail: { ip: clientIp(req) } });
          json(res, 401, { error: 'Invalid username or password.' });
          return;
        }
        const session = issueSession(db, { username, ttlMs: cfg.sessionTtlMs });
        db.audit({ actor: username, action: 'login_success' });
        json(res, 200, { authenticated: true, username, csrfToken: session.csrfToken }, {
          'Set-Cookie': sessionCookie(session.token, { secure: cfg.cookieSecure, maxAgeSeconds: cfg.sessionTtlMs / 1000 }),
        });
        return;
      }

      if (req.method === 'GET' && path === '/api/auth/session') {
        const session = getSessionFromRequest(db, req);
        if (!session) {
          json(res, 401, { authenticated: false });
          return;
        }
        json(res, 200, { authenticated: true, username: session.username, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
        return;
      }

      if (req.method === 'POST' && path === '/api/auth/logout') {
        const session = getSessionFromRequest(db, req);
        if (session && !verifyCsrf(req, session)) {
          json(res, 403, { error: 'Invalid CSRF token.' });
          return;
        }
        if (session) {
          destroySession(db, req);
          db.audit({ actor: session.username, action: 'logout' });
        }
        json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie({ secure: cfg.cookieSecure }) });
        return;
      }

      // Authenticated admin API -------------------------------------------
      if (path.startsWith('/api/admin/')) {
        const session = getSessionFromRequest(db, req);
        if (!session) {
          json(res, 401, { error: 'Authentication required.' });
          return;
        }

        if (path === '/api/admin/iso' || path.startsWith('/api/admin/iso/')) {
          await handleIsoAdmin({ req, res, path, url, session, db });
          return;
        }

        if (req.method === 'GET' && path === '/api/admin/leads') {
          // Existing fields are unchanged; "referral" is the current effective credit or null.
          const referrals = db.referrals.leadSummaries();
          let leads = db.listLeads().map((lead) => ({ ...withValidation(lead), referral: referrals.get(lead.id) ?? null }));
          const referredBy = url.searchParams.get('referredBy');
          if (referredBy === 'direct') leads = leads.filter((lead) => !lead.referral);
          else if (referredBy) leads = leads.filter((lead) => lead.referral?.isoOrganizationId === referredBy);
          json(res, 200, { leads });
          return;
        }

        const matchReferral = path.match(/^\/api\/admin\/leads\/([^/]+)\/referral$/);
        if (matchReferral && req.method === 'GET') {
          json(res, 200, { referral: db.referrals.getLeadReferral(decodeURIComponent(matchReferral[1])) });
          return;
        }
        if (matchReferral && req.method === 'POST') {
          if (!verifyCsrf(req, session)) {
            json(res, 403, { error: 'Invalid CSRF token.' });
            return;
          }
          const { changed, replayed = false, ...referral } = db.referrals.correctLeadReferral(decodeURIComponent(matchReferral[1]), await readJson(req, 16 * 1024), session.username);
          json(res, 200, { changed, ...(replayed ? { replayed } : {}), referral });
          return;
        }

        const matchReview = path.match(/^\/api\/admin\/leads\/([^/]+)\/review$/);
        if (req.method === 'POST' && matchReview) {
          if (!verifyCsrf(req, session)) {
            json(res, 403, { error: 'Invalid CSRF token.' });
            return;
          }
          const id = decodeURIComponent(matchReview[1]);
          const current = db.getLead(id);
          if (!current) {
            json(res, 404, { error: 'Inquiry not found.' });
            return;
          }
          if (current.demo !== true) {
            json(res, 403, { error: 'This MVP only permits workflow changes on demo inquiries.' });
            return;
          }
          const body = await readJson(req, 16 * 1024);
          let reviewed;
          try {
            reviewed = applyDemoReview(current, {
              stage: body.stage,
              note: body.note ?? '',
              reason: body.reason ?? '',
            });
          } catch (error) {
            error.statusCode = 422;
            throw error;
          }
          const updated = db.updateLeadReview(reviewed);
          db.audit({
            actor: session.username,
            action: 'review_saved',
            leadId: updated.id,
            detail: { stageBefore: current.stage, stageAfter: updated.stage, reason: updated.followUpReason },
          });
          json(res, 200, { lead: withValidation(updated) });
          return;
        }

        if (req.method === 'GET' && path === '/api/admin/audit') {
          json(res, 200, { events: db.listAudit(200) });
          return;
        }

        json(res, 404, { error: 'Not found.' });
        return;
      }

      // Protect the entire /admin namespace server-side. The only public file in
      // that namespace is the login page; dashboard JS/CSS live outside /admin.
      if (req.method === 'GET' && path.startsWith('/admin/')) {
        const session = getSessionFromRequest(db, req);
        if (path === '/admin/login.html') {
          if (session) {
            redirect(res, '/admin/');
            return;
          }
          const served = await serveStatic(res, publicRoot, path, { noStore: true });
          if (!served) text(res, 404, 'Not found');
          return;
        }
        if (!session) {
          redirect(res, '/admin/login.html');
          return;
        }
        // Normalize every authenticated admin route to the dashboard entry point.
        const normalizedAdminPath = path.replace(/\/+/g, '/');
        if (normalizedAdminPath === '/admin/' || normalizedAdminPath === '/admin/index.html') {
          const served = await serveStatic(res, publicRoot, '/admin/index.html', { noStore: true });
          if (!served) text(res, 404, 'Not found');
          return;
        }
        if (normalizedAdminPath === '/admin/iso.html') {
          const served = await serveStatic(res, publicRoot, '/admin/iso.html', { noStore: true });
          if (!served) text(res, 404, 'Not found');
          return;
        }
        text(res, 404, 'Not found');
        return;
      }

      if (!['GET', 'HEAD'].includes(req.method)) {
        json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
        return;
      }

      const served = await serveStatic(res, publicRoot, path);
      if (!served) text(res, 404, 'Not found');
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      const body = { error: status >= 500 ? 'Internal server error.' : error.message };
      if (error.fieldErrors) body.fieldErrors = error.fieldErrors;
      if (error.errorCode && status < 500) body.code = error.errorCode;
      if (status >= 500) console.error(error);
      json(res, status, body);
    }
  }

  const server = createServer(handler);
  return {
    server,
    db,
    handler,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    async close({ graceMs = 5000 } = {}) {
      if (server.listening) {
        await new Promise((resolve) => {
          // Stop accepting, drop idle keep-alive sockets now, and cut anything still
          // open after the grace period so SIGTERM always reaches db.close().
          const force = setTimeout(() => server.closeAllConnections(), graceMs);
          force.unref();
          server.close(() => { clearTimeout(force); resolve(); });
          server.closeIdleConnections();
        });
      }
      if (!options.db) db.close();
    },
  };
}
