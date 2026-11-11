import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { applyDemoReview } from '../public/js/lib/review-workflow.js';
import { evaluateLead } from '../public/js/lib/validation-engine.js';
import { validationRules } from '../public/js/config/validation-rules.js';
import { openDatabase } from './db.mjs';
import { createLeadFromInquiry, validateInquiryPayload } from './inquiry.mjs';
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

export function createApp(options) {
  const cfg = options.config;
  const db = options.db ?? openDatabase(cfg.dbPath, { seed: cfg.seedSampleLeads });
  const loginLimit = rateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
  const inquiryLimit = rateLimiter({ limit: 40, windowMs: 10 * 60 * 1000 });

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);

    try {
      if (req.method === 'GET' && path === '/healthz') {
        json(res, 200, { ok: true, demoMode: cfg.demoMode });
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
        const lead = db.insertLead(createLeadFromInquiry(validated, { demoMode: true }));
        db.audit({ actor: 'public-demo', action: 'demo_inquiry_created', leadId: lead.id, detail: { source: lead.source, medium: lead.medium, campaign: lead.campaign } });
        json(res, 201, lead);
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

        if (req.method === 'GET' && path === '/api/admin/leads') {
          json(res, 200, { leads: db.listLeads().map(withValidation) });
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
    async close() {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      if (!options.db) db.close();
    },
  };
}
