import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';
import { DEMO_IDENTITIES } from '../public/js/data/demo-identities.js';

function testConfig(dir) {
  return {
    port: 0,
    host: '127.0.0.1',
    production: false,
    demoMode: true,
    seedSampleLeads: true,
    dbPath: join(dir, 'test.sqlite'),
    adminUsername: 'reviewer',
    adminPassword: 'test-password-12345',
    sessionSecret: 'test-session-secret-at-least-32-characters',
    sessionTtlMs: 60 * 60 * 1000,
    cookieSecure: false,
    maxBodyBytes: 64 * 1024,
  };
}

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'gcp-server-test-'));
  const app = createApp({ config: testConfig(dir) });
  const address = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  return { app, dir, base };
}

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

async function login(base) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username: 'reviewer', password: 'test-password-12345' }),
    redirect: 'manual',
  });
  const body = await response.json();
  return { response, body, cookie: cookieFrom(response) };
}

function completeAnswers() {
  return {
    industry: 'retail',
    state: 'CT',
    timeInBusiness: '2_5y',
    monthlyRevenue: '50000',
    amountRequested: '25000',
    useOfFunds: 'inventory',
    useOfFundsDetail: 'Fictional seasonal inventory',
    hasExistingFinancing: 'no',
    existingFinancingTypes: [],
    demoAcknowledged: true,
  };
}

test('admin page redirects to login until authenticated', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });

  const unauth = await fetch(`${base}/admin/`, { redirect: 'manual' });
  assert.equal(unauth.status, 303);
  assert.equal(unauth.headers.get('location'), '/admin/login.html');

  const auth = await login(base);
  assert.equal(auth.response.status, 200);
  assert.equal(auth.body.authenticated, true);
  assert.ok(auth.body.csrfToken);
  assert.match(auth.cookie, /^gcp_session=/);

  const dashboard = await fetch(`${base}/admin/`, { headers: { Cookie: auth.cookie }, redirect:'manual' });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Internal dashboard/);
});

test('wrong password is rejected and session endpoint requires cookie', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });
  const bad = await fetch(`${base}/api/auth/login`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:'reviewer',password:'wrong'}),
  });
  assert.equal(bad.status, 401);
  const noSession = await fetch(`${base}/api/auth/session`);
  assert.equal(noSession.status, 401);
});

test('demo inquiry is validated and persisted server-side', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });

  const response = await fetch(`${base}/api/inquiries`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      answers: completeAnswers(),
      identity: DEMO_IDENTITIES[0],
      source: 'Google',
      medium: 'CPC',
      campaign: 'Spring Test',
    }),
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.demo, true);
  assert.equal(created.source, 'google');
  assert.equal(created.medium, 'cpc');
  assert.equal(created.stage, 'new');

  const auth = await login(base);
  const leadsResponse = await fetch(`${base}/api/admin/leads`, { headers:{Cookie:auth.cookie} });
  assert.equal(leadsResponse.status, 200);
  const { leads } = await leadsResponse.json();
  assert.ok(leads.some((lead) => lead.id === created.id));
});

test('demo endpoint rejects invented contact identity and missing answers', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });

  const invented = await fetch(`${base}/api/inquiries`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ answers: completeAnswers(), identity: {...DEMO_IDENTITIES[0], email:'real@example.org'} }),
  });
  assert.equal(invented.status, 422);

  const incomplete = await fetch(`${base}/api/inquiries`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ answers: {demoAcknowledged:true}, identity: DEMO_IDENTITIES[0] }),
  });
  assert.equal(incomplete.status, 422);
  const body = await incomplete.json();
  assert.ok(body.fieldErrors.industry);
});

test('review mutations require authentication and CSRF, and persist', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });
  const auth = await login(base);

  const leads = await (await fetch(`${base}/api/admin/leads`, {headers:{Cookie:auth.cookie}})).json();
  const lead = leads.leads.find((item) => item.stage === 'new' && item.validation.status === 'ready_for_review');
  assert.ok(lead);

  const noCsrf = await fetch(`${base}/api/admin/leads/${lead.id}/review`, {
    method:'POST', headers:{Cookie:auth.cookie,'Content-Type':'application/json'},
    body:JSON.stringify({stage:'in_review',note:'Test review'}),
  });
  assert.equal(noCsrf.status, 403);

  const saved = await fetch(`${base}/api/admin/leads/${lead.id}/review`, {
    method:'POST', headers:{Cookie:auth.cookie,'Content-Type':'application/json','X-CSRF-Token':auth.body.csrfToken},
    body:JSON.stringify({stage:'in_review',note:'Test review'}),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.lead.stage, 'in_review');
  assert.equal(savedBody.lead.reviewHistory.at(-1).note, 'Test review');

  const refreshed = await (await fetch(`${base}/api/admin/leads`, {headers:{Cookie:auth.cookie}})).json();
  assert.equal(refreshed.leads.find((item)=>item.id===lead.id).stage, 'in_review');
});

test('server enforces stage transition rules', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });
  const auth = await login(base);
  const leads = await (await fetch(`${base}/api/admin/leads`, {headers:{Cookie:auth.cookie}})).json();
  const lead = leads.leads.find((item) => item.stage === 'new');
  const invalid = await fetch(`${base}/api/admin/leads/${lead.id}/review`, {
    method:'POST', headers:{Cookie:auth.cookie,'Content-Type':'application/json','X-CSRF-Token':auth.body.csrfToken},
    body:JSON.stringify({stage:'handed_off',note:'skip'}),
  });
  assert.equal(invalid.status, 422);
  assert.match((await invalid.json()).error, /not permitted/i);
});

test('security headers include a same-origin CSP', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });
  const response = await fetch(`${base}/`);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});

test('alternate admin paths cannot bypass authentication', async (t) => {
  const { app, dir, base } = await start();
  t.after(async () => { await app.close(); rmSync(dir, {recursive:true,force:true}); });
  for (const path of ['/admin/index.html', '/admin//index.html', '/admin/anything']) {
    const response = await fetch(`${base}${path}`, {redirect:'manual'});
    assert.equal(response.status, 303, path);
    assert.equal(response.headers.get('location'), '/admin/login.html');
  }
});

test('SQLite lead records survive a server restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gcp-restart-test-'));
  const cfg = testConfig(dir);
  const app1 = createApp({config:cfg});
  const address1 = await app1.listen(0, '127.0.0.1');
  const base1 = `http://127.0.0.1:${address1.port}`;
  const createdResponse = await fetch(`${base1}/api/inquiries`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({answers:completeAnswers(),identity:DEMO_IDENTITIES[1],source:'referral'}),
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);
  await app1.close();

  const app2 = createApp({config:cfg});
  const address2 = await app2.listen(0, '127.0.0.1');
  t.after(async () => { await app2.close(); rmSync(dir,{recursive:true,force:true}); });
  const base2 = `http://127.0.0.1:${address2.port}`;
  const auth = await login(base2);
  const {leads} = await (await fetch(`${base2}/api/admin/leads`, {headers:{Cookie:auth.cookie}})).json();
  assert.ok(leads.some((lead)=>lead.id===created.id));
});
