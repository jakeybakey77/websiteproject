// Run with node tests/browser/gate-b-smoke.mjs and a local Playwright installation.
// GCP_PLAYWRIGHT_MODULE and GCP_CHROMIUM can point to externally installed tools.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CREDENTIALS, isoApplication, login, start, submitIsoApplication } from '../helpers/server.js';

const { chromium } = await import(process.env.GCP_PLAYWRIGHT_MODULE || 'playwright');
const cleanup = [];
const t = { after: (callback) => cleanup.unshift(callback) };
let browser;
const ISO = '/api/admin/iso';
const REASON = 'Verified the fictional referral attribution in this local demo.';
const validShape = 'gcp_' + 'x'.repeat(24);

async function expectStatus(response, status = 200) {
  const result = await response;
  assert.equal(result.status, status);
  return result.body;
}

async function onboard(admin, base, index) {
  const { reference: id } = await expectStatus(submitIsoApplication(base, isoApplication(index)), 201);
  const org = ISO + '/organizations/' + id;
  for (const stage of ['research_needed', 'under_review', 'verified', 'outreach_ready', 'contacted', 'engaged', 'active_partner']) {
    if (stage === 'verified') {
      const { evidenceId } = await expectStatus(admin.post(org + '/evidence', {
        category: 'business_identity', sourceType: 'registry', claim: 'Fictional registry entry.',
      }), 201);
      await expectStatus(admin.post(ISO + '/evidence/' + evidenceId + '/review', { status: 'confirmed', notes: REASON }));
      await expectStatus(admin.post(org + '/verification', { status: 'verified', note: REASON }));
    }
    await expectStatus(admin.post(org + '/stage', { stage, note: REASON }));
  }
  return id;
}

try {
  const local = await start(t);
  const admin = await login(local.base);
  const a = await onboard(admin, local.base, 0);
  const b = await onboard(admin, local.base, 1);
  const { reference: ineligible } = await expectStatus(submitIsoApplication(local.base, isoApplication(2)), 201);
  const eligibleName = (await expectStatus(admin.get(ISO + '/organizations/' + a))).organization.displayName;
  const bName = (await expectStatus(admin.get(ISO + '/organizations/' + b))).organization.displayName;
  browser = await chromium.launch({ executablePath: process.env.GCP_CHROMIUM, headless: true });
  const context = await browser.newContext({ baseURL: local.base, viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: local.base });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const unexpected = [];
  let expectedFailure = false;
  let expected422 = false;
  page.on('pageerror', () => errors.push('Uncaught browser exception'));
  page.on('console', (message) => {
    if (message.type() === 'error' && !(expectedFailure || expected422)) errors.push('Unexpected console error');
    if (/gcp_[A-Za-z0-9_-]{24}/.test(message.text())) errors.push('Referral code in console');
  });
  page.on('requestfailed', (request) => {
    if (!expectedFailure) failed.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText });
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !(expected422 && response.status() === 422)) unexpected.push(response.status());
  });
  page.on('dialog', (dialog) => dialog.accept());
  const btn = (name) => page.getByRole('button', { name, exact: true });
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  const visible = (locator) => locator.waitFor({ state: 'visible' });
  const waitText = (text) => visible(page.getByText(text, { exact: true }));
  const iso = (id) => '/admin/iso.html#org=' + encodeURIComponent(id);
  const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const picture = async (name) => {
    const dir = process.env.GCP_QA_SCREENSHOTS;
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name + '.png'), mask: [page.locator('#referral-active-link')] });
  };
  const finishPageLoad = async () => {
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready.then(() => {}));
  };
  async function openReferrals(org) {
    await page.goto(iso(org));
    await visible(page.locator('#detail-title'));
    await btn('Referrals').focus();
    await page.keyboard.press('Enter');
    await visible(heading('Demo referral links'));
    assert.equal(await btn('Referrals').getAttribute('aria-pressed'), 'true');
  }
  async function fillInquiry() {
    await page.locator('#industry').selectOption('retail');
    await page.locator('#state').selectOption('CT');
    await page.locator('[name=timeInBusiness][value="2_5y"]').check();
    await btn('Continue').click();
    await page.locator('#monthlyRevenue').fill('50000');
    await page.locator('#amountRequested').fill('25000');
    await page.locator('#useOfFunds').selectOption('inventory');
    await btn('Continue').click();
    await page.locator('[name=hasExistingFinancing][value=no]').check();
    await btn('Continue').click();
    await page.locator('#demoAcknowledged').check();
    await btn('Review answers').click();
    await visible(heading('Review your answers'));
  }
  async function receipt(recorded) {
    await visible(heading('Demo inquiry submitted'));
    assert.equal(await page.getByText('Referral recorded', { exact: true }).isVisible(), recorded);
    assert.equal(await heading('Demo inquiry submitted').getAttribute('aria-describedby'), recorded ? 'referral-recorded' : null);
    return (await page.locator('.confirmation strong').textContent()).trim();
  }

  await page.goto('/admin/login.html');
  await page.locator('#username').fill(CREDENTIALS.username);
  await page.locator('#password').fill(CREDENTIALS.password);
  await btn('Sign in').click();
  await page.waitForURL('/admin/');
  await visible(heading('Merchant inquiries'));
  await finishPageLoad();
  await visible(page.locator('#lead-rows .inquiry-name').first());
  await openReferrals(ineligible);
  assert.ok(await btn('Issue demo referral link').isDisabled());
  await waitText('Available only while the partner is Active and Verified.');
  await openReferrals(a);
  await btn('Issue demo referral link').click();
  await visible(page.locator('#referral-active-link'));
  assert.equal(await page.getByText('false', { exact: true }).count(), 0);
  const firstUrl = await page.locator('#referral-active-link').inputValue();
  assert.equal(new URL(firstUrl).origin, local.base);
  await btn('Copy').click();
  await waitText('Referral link copied.');
  assert.ok(await page.evaluate(() => navigator.clipboard.readText()) === firstUrl, 'Clipboard contains the link');
  await fits();
  await picture('desktop-iso-referrals');

  const firstCode = new URL(firstUrl).searchParams.get('ref');
  const arrival = '/?ref=' + encodeURIComponent(firstCode) + '&utm_source=meta_ads&utm_medium=cpc&utm_campaign=gate-b';
  await page.goto(arrival);
  await page.getByRole('link', { name: 'For partners', exact: true }).first().click();
  assert.ok(!new URL(page.url()).searchParams.has('ref') && !await page.evaluate(() => document.referrer));
  assert.equal(new URL(page.url()).searchParams.get('utm_source'), 'meta_ads');
  await finishPageLoad();
  await page.goto(arrival);
  await page.getByRole('link', { name: 'Get Business Funding', exact: true }).first().click();
  await waitText('Referral link detected (demo)');
  assert.equal(await page.locator('#referral-banner [role=status]').count(), 1);
  assert.ok(!(await page.locator('main').textContent()).includes(eligibleName), 'Applicant cannot see the partner identity');
  assert.ok(await page.evaluate(() => !JSON.stringify([localStorage, sessionStorage]).includes('gcp_')));
  await picture('desktop-applicant-referral');
  await fillInquiry();

  const submissions = [];
  let replay = false;
  expectedFailure = true;
  await page.route('**/api/inquiries', async (route) => {
    submissions.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (submissions.length === 1) {
      assert.equal(response.status(), 201);
      await route.abort('connectionreset');
    } else {
      replay = response.headers()['idempotent-replay'] === 'true';
      await route.fulfill({ response });
    }
  });
  await page.locator('#inquiry-form').evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await waitText('The submission could not be confirmed. Your answers are still here. Select Submit demo inquiry to retry.');
  assert.equal(submissions.length, 1);
  expectedFailure = false;
  await btn('Submit demo inquiry').click();
  const referred = await receipt(true);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].submissionId, submissions[1].submissionId);
  assert.ok(submissions.every((body) => body.referralCode === firstCode));
  assert.equal(replay, true);
  await page.unroute('**/api/inquiries');
  const all = await expectStatus(admin.get('/api/admin/leads?referredBy=' + encodeURIComponent(a)));
  assert.deepEqual(all.leads.map((lead) => [lead.id, lead.source]), [[referred, 'meta_ads']]);
  await openReferrals(a);
  await visible(page.getByRole('link', { name: referred, exact: true }));
  await page.locator('#referrals-from').fill('2000-01-01');
  await page.locator('#referrals-to').fill('2000-01-02');
  await btn('Apply dates').click();
  await waitText('No data');
  await btn('Activity').click();
  await btn('Referrals').click();
  await page.locator('#referrals-from').fill('');
  await page.locator('#referrals-to').fill('');
  await btn('Apply dates').click();
  await page.getByRole('link', { name: referred, exact: true }).click();
  await visible(heading('Referral attribution'));
  await visible(page.locator('#referral-target'));
  assert.equal(await page.locator('#lead-dialog').evaluate((element) => element.open), true);
  await page.locator('#referral-target').selectOption(b);
  await page.locator('#referral-reason').fill('too short');
  await btn('Confirm correction').click();
  assert.equal(await page.locator('#referral-reason').evaluate((el) => el.validationMessage),
    'Enter a reason with at least 10 non-whitespace characters.');
  await page.locator('#referral-reason').fill(REASON);

  const correctionIds = [];
  expectedFailure = true;
  await page.route('**/api/admin/leads/*/referral', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    correctionIds.push(route.request().postDataJSON().requestId);
    const response = await route.fetch();
    if (correctionIds.length === 1) await route.abort('connectionreset');
    else await route.fulfill({ response });
  });
  await btn('Confirm correction').click();
  await waitText('The correction could not be confirmed. Try again.');
  expectedFailure = false;
  await btn('Confirm correction').click();
  await waitText('No change');
  assert.equal(correctionIds.length, 2);
  assert.equal(correctionIds[0], correctionIds[1]);
  await page.unroute('**/api/admin/leads/*/referral');
  const history = (await expectStatus(admin.get('/api/admin/leads/' + referred + '/referral'))).referral;
  assert.equal(history.original.isoOrganizationId, a);
  assert.equal(history.current.isoOrganizationId, b);
  assert.deepEqual(history.history.map((row) => row.eventType), ['created', 'corrected']);
  await picture('desktop-merchant-attribution');
  await page.keyboard.press('Escape');
  await page.locator('#lead-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement.classList.contains('inquiry-name'));
  await page.locator('#referred-by').selectOption(b);
  assert.equal(await page.locator('#lead-rows tr').count(), 1);
  await btn('Referred by').click();
  assert.equal(await page.locator('#referral-sort-heading').getAttribute('aria-sort'), 'ascending');
  assert.equal(await page.locator('.referral-cell a').textContent(), bName);

  await openReferrals(a);
  await btn('Rotate').click();
  assert.equal(await page.locator('#referral-link-reason').evaluate((el) => el === document.activeElement), true);
  await page.locator('#referral-link-reason').fill(REASON);
  await btn('Confirm rotation').click();
  await waitText('Demo referral link rotated.');
  const secondUrl = await page.locator('#referral-active-link').inputValue();
  assert.ok(secondUrl !== firstUrl);
  await btn('Revoke').click();
  await page.locator('#referral-link-reason').fill(REASON);
  await btn('Confirm revocation').click();
  await waitText('Demo referral link revoked.');
  await btn('Issue demo referral link').click();
  await waitText('Demo referral link is active.');
  const thirdUrl = await page.locator('#referral-active-link').inputValue();
  await btn('Overview').click();
  await page.getByLabel('Move to', { exact: true }).selectOption('archived');
  await page.locator('#detail-section-overview [name=note]').fill(REASON);
  await btn('Change stage').click();
  await visible(page.getByRole('button', { name: 'Overview', pressed: true }));
  await btn('Referrals').click();
  await waitText('Available only while the partner is Active and Verified.');
  assert.ok(await btn('Issue demo referral link').isDisabled());
  const links = await expectStatus(admin.get(ISO + '/organizations/' + a + '/referral-codes'));
  assert.equal(links.activeCode, null);
  assert.ok(links.codes.every(({ status }) => status === 'revoked'));
  assert.ok(links.codes.some(({ revokeReason }) => revokeReason?.includes('stage')));
  assert.ok(thirdUrl !== secondUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?ref=a&ref=b&utm_source=meta_ads');
  await page.locator('.mobile-menu summary').click();
  await page.locator('.mobile-menu').getByRole('link', { name: 'Get Business Funding' }).click();
  assert.deepEqual(new URL(page.url()).searchParams.getAll('ref'), ['a', 'b']);
  await visible(page.getByRole('alert'));
  assert.match(await page.locator('#referral-banner').ariaSnapshot(), /alert/);
  await fits();
  await picture('mobile-invalid-referral');
  await fillInquiry();
  await btn('Submit demo inquiry').click();
  const remove = btn('Remove referral and continue directly');
  assert.ok(await remove.evaluate((element) => element === document.activeElement));
  await page.keyboard.press('Enter');
  assert.ok(!new URL(page.url()).searchParams.has('ref'));
  assert.equal(new URL(page.url()).searchParams.get('utm_source'), 'meta_ads');
  await btn('Submit demo inquiry').click();
  const removedDirect = await receipt(false);

  await page.goto('/apply.html?ref=malformed');
  await visible(page.getByRole('alert'));
  await finishPageLoad();
  await page.goto('/apply.html');
  assert.equal(await page.locator('#referral-banner').isVisible(), false);
  await fillInquiry();
  await btn('Submit demo inquiry').click();
  const direct = await receipt(false);
  await page.goto('/admin/#lead=' + encodeURIComponent(direct));
  await visible(page.locator('#referral-target'));
  await page.locator('#referral-target').selectOption(b);
  await page.locator('#referral-reason').fill(REASON);
  await btn('Confirm correction').click();
  await waitText('Referral attribution saved.');
  await page.locator('#referral-target').selectOption('remove');
  await page.locator('#referral-reason').fill(REASON);
  await btn('Confirm correction').click();
  await waitText('Referral attribution saved.');
  const removal = (await expectStatus(admin.get('/api/admin/leads/' + direct + '/referral'))).referral;
  assert.deepEqual(removal.history.map((event) => event.eventType), ['corrected', 'removed']);

  for (const code of [firstCode, validShape]) {
    await page.goto('/apply.html?ref=' + encodeURIComponent(code) + '&utm_source=meta_ads');
    await fillInquiry();
    expected422 = true;
    await btn('Submit demo inquiry').click();
    await visible(page.getByRole('alert'));
    assert.ok(await remove.evaluate((element) => element === document.activeElement));
    expected422 = false;
    await remove.click();
    await btn('Submit demo inquiry').click();
    await receipt(false);
  }
  for (const leadId of [direct, removedDirect]) {
    assert.equal((await expectStatus(admin.get('/api/admin/leads/' + leadId + '/referral'))).referral.current, null);
  }
  await openReferrals(b);
  await visible(page.getByRole('link', { name: referred, exact: true }));
  await fits();
  await picture('mobile-iso-referrals');
  await page.getByRole('link', { name: referred, exact: true }).click();
  await visible(page.locator('#referral-target'));
  await fits();
  await heading('Referral attribution').scrollIntoViewIfNeeded();
  await picture('mobile-merchant-attribution');
  assert.deepEqual({ errors, failed, unexpected }, { errors: [], failed: [], unexpected: [] });

  await context.close();
  await local.close();
  const restarted = await start(t, { dir: local.dir, cleanup: false });
  const restartedAdmin = await login(restarted.base);
  const afterRestart = await expectStatus(restartedAdmin.get(ISO + '/organizations/' + b + '/referrals'));
  assert.deepEqual(afterRestart.items.map(({ leadId }) => leadId), [referred]);
  const persisted = (await expectStatus(restartedAdmin.get('/api/admin/leads/' + referred + '/referral'))).referral;
  assert.equal(persisted.original.isoOrganizationId, a);
  assert.equal(persisted.current.isoOrganizationId, b);
  console.log('Gate B browser smoke passed on 1440px and 390px, including persistence after restart.');
} finally {
  await browser?.close();
  for (const callback of cleanup) await callback();
}
