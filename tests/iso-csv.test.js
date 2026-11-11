import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_LIMITS, decodeCsvUpload, fileHash, parseCsv, resolveMapping, suggestMapping, validateImportRow } from '../server/iso-csv.mjs';
import { isNearName, isReservedHost, isSyntheticEmail, nameKey, normalizeDomain, normalizeSyntheticPhone, normalizeSyntheticUrl } from '../public/js/lib/synthetic-identity.js';
import { csvCell } from '../public/js/lib/csv-export.js';

const b64 = (value) => Buffer.from(value).toString('base64');
const HEADERS = ['organization_name', 'website', 'state', 'specializations', 'relationship_type', 'contact_name', 'contact_email', 'contact_phone'];
const MAPPING = suggestMapping(HEADERS);
const row = (cells) => validateImportRow(cells, HEADERS, MAPPING);

test('synthetic guards accept only reserved hosts, emails and 555-01xx phones', () => {
  for (const host of ['example.com', 'www.Example.org', 'crm.example.net', 'sample-iso.example', 'a.b.test', 'x.invalid']) assert.equal(isReservedHost(host), true, host);
  for (const host of ['gmail.com', 'example.co', 'notexample.com', 'example.com.evil.io', 'example', 'localhost', '']) assert.equal(isReservedHost(host), false, host);
  assert.equal(isSyntheticEmail('Avery.Placeholder@Example.com'), true);
  for (const email of ['owner@gmail.com', 'a@example.com.attacker.io', 'not-an-email', 'a b@example.com', '']) assert.equal(isSyntheticEmail(email), false, email);
  assert.equal(normalizeSyntheticPhone('+1 203-555-0171'), '(203) 555-0171');
  assert.equal(normalizeSyntheticPhone('(203) 555-0199'), '(203) 555-0199');
  for (const phone of ['(203) 555-1234', '203-867-5309', '555-0101', 'call me', '']) assert.equal(normalizeSyntheticPhone(phone), '', phone);
  assert.equal(normalizeSyntheticUrl('sample-iso.example/about'), 'https://sample-iso.example/about');
  for (const url of ['https://real-broker.com', 'javascript:alert(1)', 'ftp://files.example.com', 'https://user:pw@example.com']) assert.equal(normalizeSyntheticUrl(url), '', url);
});

test('domain and name normalization are stable; near-name is a warning signal only', () => {
  assert.equal(normalizeDomain('HTTPS://WWW.Sample-ISO.example:443/path?q=1'), 'sample-iso.example');
  assert.equal(normalizeDomain('not a host'), '');
  assert.equal(nameKey('Sample Harbor Capital, L.L.C.'), nameKey('sample harbor capital l l c'));
  assert.equal(nameKey('Sample Harbor Capital LLC'), 'sample harbor capital');
  assert.equal(nameKey('Sample & Harbor Inc.'), 'sample and harbor');
  assert.equal(isNearName('sample harbor capital', 'sample harbour capital'), true);
  assert.equal(isNearName('sample harbor capital', 'sample harbor capital'), false, 'exact match is not "near"');
  assert.equal(isNearName('sample harbor capital', 'demo ridge funding'), false);
  assert.equal(isNearName('abc co', 'abd co'), false, 'short names are too ambiguous to flag');
});

test('parser handles quotes, embedded commas/newlines, CRLF, blank lines and escaped quotes', () => {
  const { headers, rows } = parseCsv('name,note\r\n"Fictional Orchard, Inc.","line one\nline two"\r\n\r\n"She said ""hi""",plain\n');
  assert.deepEqual(headers, ['name', 'note']);
  assert.deepEqual(rows, [['Fictional Orchard, Inc.', 'line one\nline two'], ['She said "hi"', 'plain']]);
});

test('parser rejects malformed and oversized input with a 422', () => {
  const bad = (text, pattern) => assert.throws(() => parseCsv(text), (error) => error.statusCode === 422 && pattern.test(error.message));
  bad('name\n"unterminated', /unterminated/);
  bad('name,name\nA,B', /duplicate column/);
  bad('name,\nA,B', /empty column name/);
  bad('name\n', /no data rows/);
  bad(`name\n${Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => `Org ${i}`).join('\n')}`, /more than 500 data rows/);
  bad(`${Array.from({ length: IMPORT_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`).join(',')}\nA`, /more than 30 columns/);
});

test('upload decoding enforces size, strict UTF-8 and text-only content', () => {
  assert.equal(decodeCsvUpload(b64('﻿name\nSample Org')), 'name\nSample Org', 'BOM is stripped');
  assert.throws(() => decodeCsvUpload(Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0xff, 0xfe, 0xfd]).toString('base64')), (e) => e.statusCode === 422 && /not valid UTF-8/.test(e.message));
  assert.throws(() => decodeCsvUpload(b64('name\nA\u0000B')), /binary or control characters/);
  assert.throws(() => decodeCsvUpload(b64('x'.repeat(IMPORT_LIMITS.maxBytes + 1))), (e) => e.statusCode === 413);
  assert.throws(() => decodeCsvUpload('not base64 !!'), (e) => e.statusCode === 400);
  assert.throws(() => decodeCsvUpload(b64('   \n ')), /empty/);
  assert.throws(() => decodeCsvUpload(undefined), (e) => e.statusCode === 400);
});

test('mapping: suggestions, explicit override, and refusal of bad mappings', () => {
  assert.equal(MAPPING.organizationName, 'organization_name');
  assert.equal(MAPPING.region, 'state');
  assert.equal(resolveMapping(['Company', 'Mail'], { contactEmail: 'Mail' }).contactEmail, 'Mail');
  assert.throws(() => resolveMapping(['a', 'b'], undefined), /Organization name/);
  assert.throws(() => resolveMapping(['Company'], { contactEmail: 'Missing' }), /not in the file/);
  assert.throws(() => resolveMapping(['Company'], { __proto__evil: 'Company' }), /Unknown import field/);
  assert.throws(() => resolveMapping(['Company', 'x'], { legalName: 'Company' }), /only one field/);
});

test('valid row is normalized; row hash is stable across cosmetic differences in the same values', () => {
  const a = row(['Sample Meadow  Capital', 'HTTPS://WWW.sample-meadow.example/', 'ct', 'SBA; working_capital', 'ISO', 'Jamie Placeholder', 'Jamie@Example.com', '+1 (203) 555-0181']);
  assert.equal(a.ok, true);
  assert.deepEqual(a.value, { organizationName: 'Sample Meadow Capital', legalName: '', website: 'https://www.sample-meadow.example/', domain: 'sample-meadow.example', region: 'CT',
    specializations: ['sba', 'working_capital'], relationshipType: 'iso', contactName: 'Jamie Placeholder', contactRole: '', contactEmail: 'jamie@example.com', contactPhone: '(203) 555-0181' });
  const b = row(['Sample Meadow Capital', 'https://www.sample-meadow.example/', 'CT', 'sba;working_capital', 'iso', 'Jamie Placeholder', 'jamie@example.com', '203.555.0181']);
  assert.equal(a.rowHash, b.rowHash);
});

test('formula-injection payloads are rejected at import in every text field', () => {
  for (const payload of ['=HYPERLINK("http://evil.test","x")', '+SUM(1,2)', '-2+3', '@cmd', '\t=1+1', '=cmd|\' /C calc\'!A0']) {
    const result = validateImportRow([payload], ['organization_name'], { organizationName: 'organization_name' });
    assert.equal(result.ok, false, payload);
    assert.ok(result.errors.some((e) => e.code === 'formula_like_value'), payload);
  }
  const inContact = row(['Sample Org One', '', '', '', '', '=1+1', '', '']);
  assert.ok(inContact.errors.some((e) => e.code === 'formula_like_value' && e.field === 'contactName'));
  assert.equal(row(['Sample Org One', '', '', '', '', '', '', '+1 203 555 0181']).ok, true, 'a leading + is allowed only for a valid fictional phone');
  assert.ok(row(['Sample Org One', '', '', '', '', '', '', '+1+1']).errors.some((e) => e.code === 'formula_like_value'));
});

test('export escaping neutralizes formula-leading cells (defense in depth for stored values)', () => {
  for (const value of ['=1+1', '+1', '-1', '@x', ' =1', '\t=1']) assert.ok(csvCell(value).startsWith('"\''), value);
  assert.equal(csvCell('Sample "Quoted" Org'), '"Sample ""Quoted"" Org"');
});

test('rows with real-looking contact details are rejected and flagged for redaction', () => {
  const realEmail = row(['Sample Org', '', '', '', '', 'Pat Real', 'pat@realbroker.com', '']);
  assert.equal(realEmail.ok, false);
  assert.equal(realEmail.redacted, true);
  assert.equal(realEmail.value, null);
  assert.ok(realEmail.errors.some((e) => e.code === 'not_synthetic' && e.field === 'contactEmail'));
  assert.ok(row(['Sample Org', '', '', '', '', '', '', '212-867-5309']).errors.some((e) => e.field === 'contactPhone' && e.code === 'not_synthetic'));
  assert.ok(row(['Sample Org', 'https://realbroker.com', '', '', '', '', '', '']).errors.some((e) => e.field === 'website' && e.code === 'not_synthetic'));
});

test('schema validation: required name, enums, lengths and extra cells', () => {
  assert.ok(row(['', '', '', '', '', '', '', '']).errors.some((e) => e.code === 'required'));
  assert.ok(row(['!!!', '', '', '', '', '', '', '']).errors.some((e) => e.field === 'organizationName'));
  assert.ok(row(['Sample Org', '', 'ZZ', '', '', '', '', '']).errors.some((e) => e.field === 'region'));
  assert.ok(row(['Sample Org', '', '', 'crypto_loans', '', '', '', '']).errors.some((e) => e.field === 'specializations'));
  assert.ok(row(['Sample Org', '', '', '', 'direct_lender', '', '', '']).errors.some((e) => e.field === 'relationshipType'));
  assert.ok(row(['S'.repeat(IMPORT_LIMITS.maxCellChars + 1), '', '', '', '', '', '', '']).errors.some((e) => e.code === 'value_too_long'));
  assert.ok(row(['Sample Org', '', '', '', '', '', '', '', 'extra']).errors.some((e) => e.code === 'too_many_cells'));
});

test('file hash covers content and mapping', () => {
  assert.equal(fileHash('a,b\n1,2', { x: 'a' }), fileHash('a,b\n1,2', { x: 'a' }));
  assert.notEqual(fileHash('a,b\n1,2', { x: 'a' }), fileHash('a,b\n1,3', { x: 'a' }));
  assert.notEqual(fileHash('a,b\n1,2', { x: 'a' }), fileHash('a,b\n1,2', { x: 'b' }));
});
