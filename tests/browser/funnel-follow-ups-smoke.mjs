import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DEMO_IDENTITIES } from '../../public/js/data/demo-identities.js';
import { CREDENTIALS, merchantInquiry, login, start } from '../helpers/server.js';

const { chromium } = await import(process.env.GCP_PLAYWRIGHT_MODULE || 'playwright');
const cleanup = [];
const t = { after: fn => cleanup.unshift(fn) };
const { base } = await start(t);
let browser;
const screenshots = process.env.GCP_QA_SCREENSHOTS;
const construction = 'constructionPaymentTiming';
const frequency = 'existingFinancingPaymentFrequency';
const term = 'existingFinancingRemainingTerm';
const details = {[construction]: '31_60_days', [frequency]: 'weekly', [term]: '7_12_months'};

try {
  const admin = await login(base);
  async function submit(index, answers) {
    const inquiry = merchantInquiry(DEMO_IDENTITIES[index]);
    const response = await fetch(base + '/api/inquiries', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...inquiry, answers: {...inquiry.answers, ...answers}}),
    });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  }

  const complete = await submit(0, {industry: 'construction', hasExistingFinancing: 'yes', ...details});
  const stale = await submit(1, details);
  const skipped = await submit(2, {industry: 'construction', hasExistingFinancing: 'yes'});
  const response = await admin.get('/api/admin/leads');
  assert.equal(response.status, 200);
  const lead = id => response.body.leads.find(row => row.id === id);
  assert.ok(lead(complete.id), 'submitted inquiry must be visible to reviewers');
  for (const [field, value] of Object.entries(details)) {
    assert.equal(lead(complete.id)[field], value);
    assert.ok(!lead(stale.id)[field], 'hidden answer should not persist: ' + field);
    assert.ok(!lead(skipped.id)[field], 'skipped optional field should not persist: ' + field);
  }

  browser = await chromium.launch({executablePath: process.env.GCP_CHROMIUM, headless: true});
  for (const width of [1440, 390]) {
    const page = await browser.newPage({baseURL: base, viewport: {width, height: 900}});
    await page.goto('/apply.html');
    assert.equal(await page.locator('#field-' + construction).isVisible(), false);
    await page.locator('#industry').selectOption('construction');
    await page.locator('#' + construction).selectOption(details[construction]);
    await page.locator('#industry').selectOption('retail');
    assert.equal(await page.locator('#field-' + construction).isVisible(), false);
    await page.locator('#industry').selectOption('construction');
    assert.equal(await page.locator('#' + construction).inputValue(), '');
    await page.locator('#' + construction).selectOption(details[construction]);
    await page.locator('#state').selectOption('CT');
    await page.locator('[name=timeInBusiness][value="2_5y"]').check();
    await page.locator('#next').click();
    await page.locator('#monthlyRevenue').fill('50000');
    await page.locator('#amountRequested').fill('25000');
    await page.locator('#useOfFunds').selectOption('inventory');
    await page.locator('#next').click();
    await page.locator('[name=hasExistingFinancing][value=yes]').check();
    await page.locator('#' + frequency).selectOption(details[frequency]);
    await page.locator('#' + term).selectOption(details[term]);
    await page.locator('[name=hasExistingFinancing][value=no]').check();
    for (const field of [frequency, term]) assert.equal(await page.locator('#field-' + field).isVisible(), false);
    await page.locator('[name=hasExistingFinancing][value=yes]').check();
    for (const field of [frequency, term]) {
      assert.equal(await page.locator('#' + field).inputValue(), '');
      await page.locator('#' + field).selectOption(details[field]);
    }
    await page.locator('#next').click();
    await page.locator('#demoAcknowledged').check();
    await page.locator('#next').click();
    await page.getByRole('heading', {name: 'Review your answers'}).waitFor();
    for (const label of [/31.{0,5}60 days/i, /^Weekly$/i, /7.{0,5}12 months/i]) {
      assert.ok(await page.getByText(label).first().isVisible(), 'Review displays ' + label);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({path: join(screenshots, 'v25-funnel-review-' + width + '.png'), fullPage: true});
    }
    const submitted = page.waitForResponse(res => res.url().endsWith('/api/inquiries') && res.request().method() === 'POST');
    await page.locator('#next').click();
    const result = await submitted;
    assert.equal(result.status(), 201);
    const {id} = await result.json();
    await page.getByRole('heading', {name: 'Demo inquiry submitted'}).waitFor();
    await page.goto('/admin/login.html');
    await page.locator('#username').fill(CREDENTIALS.username);
    await page.locator('#password').fill(CREDENTIALS.password);
    await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.waitForURL('/admin/');
    await page.goto('/admin/#lead=' + encodeURIComponent(id));
    const dialog = page.locator('#lead-dialog[open]');
    await dialog.waitFor();
    const registry = dialog.getByRole('link', { name: 'Search Connecticut business records' });
    assert.equal(await registry.getAttribute('href'), 'https://service.ct.gov/business/s/onlinebusinesssearch?language=en_US');
    assert.equal(await registry.getAttribute('rel'), 'noopener noreferrer');
    for (const label of [/31.{0,5}60 days/i, /^Weekly$/i, /7.{0,5}12 months/i]) {
      await dialog.getByText(label).first().waitFor();
    }
    if (screenshots) await page.screenshot({path: join(screenshots, 'v25-funnel-admin-' + width + '.png'), fullPage: true});
    await page.close();
  }
  console.log('Funnel QA passed: API persistence, hidden answers, optional omission, branch edits, review, and two viewport widths.');
} finally {
  await browser?.close();
  for (const fn of cleanup) await fn();
}
