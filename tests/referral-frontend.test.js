import test from 'node:test';
import assert from 'node:assert/strict';
import { carryInquiryQuery } from '../public/js/lib/referral-query.js';
import { submitInquiry } from '../public/js/services/lead-service.js';

const code = 'gcp_' + 'a'.repeat(24);
const params = (query) => new URLSearchParams(query);
const destination = (path) => new URL(path, 'https://example.test');

test('forwards only supported attribution and keeps ref out of ISO and unrelated routes', () => {
  const query = params('ref=' + code + '&utm_source=meta_ads&utm_medium=cpc&utm_campaign=demo&extra=discard');
  for (const path of ['/', '/apply.html', '/partner-program.html', '/partners.html']) {
    const { searchParams } = carryInquiryQuery(destination(path), query);
    assert.deepEqual([...searchParams].filter(([key]) => key.startsWith('utm_')),
      [['utm_source', 'meta_ads'], ['utm_medium', 'cpc'], ['utm_campaign', 'demo']]);
    assert.equal(searchParams.get('ref'), ['/', '/apply.html'].includes(path) ? code : null);
    assert.equal(searchParams.has('extra'), false);
  }
});

test('forwards every invalid ref value to apply, and removes stale links after explicit removal', () => {
  const old = destination('/apply.html?ref=' + code + '&keep=1#main');
  assert.deepEqual(carryInquiryQuery(old, params('ref=&ref=a%2Bb')).searchParams.getAll('ref'), ['', 'a+b']);
  const removed = carryInquiryQuery(old, params('utm_source=meta_ads'));
  assert.equal(removed.search, '?keep=1&utm_source=meta_ads');
  assert.equal(removed.hash, '#main');
  assert.equal(carryInquiryQuery(destination('/'), params('ref=a&ref=b')).search, '');
});

test('inquiry client omits direct referral codes, preserves replay receipts, and exposes API errors', async (t) => {
  const submissionId = 'demo-request-id-1234';
  const calls = [];
  const response = (status, body) => Response.json(body, { status });
  const responses = [
    response(201, { id: 'direct', referralAttribution: { recorded: false } }),
    response(200, { id: 'referred', referralAttribution: { recorded: true } }),
    response(422, { error: 'Unavailable', code: 'referral_unavailable' }),
    response(409, { error: 'Conflict', code: 'submission_conflict' }),
    response(422, { error: 'Fix answers', fieldErrors: { industry: 'Choose an industry' } }),
  ];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    calls.push({ url, payload: JSON.parse(request.body) });
    return responses.shift();
  });
  const submit = (referralCode) => submitInquiry({}, { identity: {}, submissionId, referralCode });
  assert.equal((await submit()).id, 'direct');
  assert.equal((await submit(code)).referralAttribution.recorded, true);
  await assert.rejects(submit(code), { status: 422, code: 'referral_unavailable' });
  await assert.rejects(submit(code), { status: 409, code: 'submission_conflict' });
  await assert.rejects(submit(code), { status: 422, fieldErrors: { industry: 'Choose an industry' } });
  assert.ok(calls.every(({ url, payload }) => url === '/api/inquiries' && payload.submissionId === submissionId));
  assert.equal(Object.hasOwn(calls[0].payload, 'referralCode'), false);
  assert.equal(calls[1].payload.referralCode, code);
});
