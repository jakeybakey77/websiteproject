// CSV intake for synthetic ISO partner records: decoding, parsing, header mapping
// and row-level validation. Nothing in this file writes to the database.
import { createHash } from 'node:crypto';
import { US_STATES } from '../public/js/config/form-schema.js';
import { ISO_SPECIALIZATIONS, RELATIONSHIP_TYPES, values } from '../public/js/config/iso-pipeline.js';
import { isSyntheticEmail, nameKey, normalizeDomain, normalizeSyntheticPhone, normalizeSyntheticUrl } from '../public/js/lib/synthetic-identity.js';

export const IMPORT_LIMITS = Object.freeze({ maxBytes: 256 * 1024, maxRows: 500, maxColumns: 30, maxCellChars: 300 });

export const IMPORT_FIELDS = Object.freeze([
  { field: 'organizationName', label: 'Organization name', required: true, aliases: ['organization_name', 'organization', 'org_name', 'company', 'company_name', 'name', 'display_name', 'iso_name'] },
  { field: 'legalName', label: 'Legal name', aliases: ['legal_name', 'legal_entity'] },
  { field: 'website', label: 'Website', aliases: ['website', 'url', 'domain', 'site', 'web'] },
  { field: 'region', label: 'Region (US state code)', aliases: ['region', 'state', 'st'] },
  { field: 'specializations', label: 'Specializations (separate with ; )', aliases: ['specializations', 'specialization', 'products', 'focus'] },
  { field: 'relationshipType', label: 'Relationship type', aliases: ['relationship_type', 'relationship', 'type', 'partner_type'] },
  { field: 'contactName', label: 'Contact name', aliases: ['contact_name', 'contact', 'full_name'] },
  { field: 'contactRole', label: 'Contact role', aliases: ['contact_role', 'role', 'title', 'job_title'] },
  { field: 'contactEmail', label: 'Contact email', aliases: ['contact_email', 'email', 'email_address'] },
  { field: 'contactPhone', label: 'Contact phone', aliases: ['contact_phone', 'phone', 'phone_number', 'telephone'] },
]);

const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const headerKey = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const STATES = new Set(values(US_STATES));
const SPECIALIZATIONS = new Set(values(ISO_SPECIALIZATIONS));
const RELATIONSHIPS = new Set(values(RELATIONSHIP_TYPES));

/** Strict UTF-8 decode of a base64 upload. Rejects oversize, invalid encoding and binary content. */
export function decodeCsvUpload(contentBase64) {
  if (typeof contentBase64 !== 'string' || !contentBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) {
    throw fail('CSV upload must be supplied as base64 text.', 400);
  }
  if (contentBase64.length > Math.ceil(IMPORT_LIMITS.maxBytes / 3) * 4 + 4) throw fail(`CSV file is larger than ${IMPORT_LIMITS.maxBytes / 1024} KB.`, 413);
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length > IMPORT_LIMITS.maxBytes) throw fail(`CSV file is larger than ${IMPORT_LIMITS.maxBytes / 1024} KB.`, 413);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw fail('CSV file is not valid UTF-8 text. Re-save it as UTF-8 and try again.'); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw fail('CSV file contains binary or control characters.');
  if (!text.trim()) throw fail('CSV file is empty.');
  return text;
}

/** RFC 4180-style parser. Returns { headers, rows } where rows are arrays of raw strings. */
export function parseCsv(text) {
  const records = [];
  let record = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const pushCell = () => { record.push(cell); cell = ''; };
  const pushRecord = () => {
    pushCell();
    if (record.length > IMPORT_LIMITS.maxColumns) throw fail(`CSV has more than ${IMPORT_LIMITS.maxColumns} columns.`);
    if (record.some((value) => value.trim() !== '')) records.push(record);
    if (records.length > IMPORT_LIMITS.maxRows + 1) throw fail(`CSV has more than ${IMPORT_LIMITS.maxRows} data rows.`);
    record = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i += 1; continue; }
    if (ch === ',') { pushCell(); i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRecord(); i += 1; continue;
    }
    cell += ch; i += 1;
  }
  if (quoted) throw fail('CSV has an unterminated quoted field.');
  if (cell !== '' || record.length > 0) pushRecord();
  if (records.length === 0) throw fail('CSV file is empty.');
  const headers = records[0].map((h) => h.trim());
  if (headers.some((h) => !h)) throw fail('CSV header row has an empty column name.');
  if (new Set(headers.map(headerKey)).size !== headers.length) throw fail('CSV header row has duplicate column names.');
  if (records.length === 1) throw fail('CSV has a header row but no data rows.');
  return { headers, rows: records.slice(1) };
}

export function suggestMapping(headers) {
  const mapping = {};
  for (const { field, aliases } of IMPORT_FIELDS) {
    const found = headers.find((h) => aliases.includes(headerKey(h)));
    if (found) mapping[field] = found;
  }
  return mapping;
}

/** Validates a client-supplied mapping against the real headers; falls back to suggestions. */
export function resolveMapping(headers, supplied) {
  const mapping = suggestMapping(headers);
  if (supplied != null) {
    if (typeof supplied !== 'object' || Array.isArray(supplied)) throw fail('Column mapping must be an object.', 400);
    const known = new Set(IMPORT_FIELDS.map((f) => f.field));
    for (const [field, header] of Object.entries(supplied)) {
      if (!known.has(field)) throw fail(`Unknown import field in mapping: ${String(field).slice(0, 40)}`);
      if (header === '' || header == null) { delete mapping[field]; continue; }
      if (!headers.includes(header)) throw fail(`Mapped column is not in the file: ${String(header).slice(0, 60)}`);
      mapping[field] = header;
    }
  }
  if (!mapping.organizationName) throw fail('Map a column to "Organization name" before importing.');
  const used = Object.values(mapping);
  if (new Set(used).size !== used.length) throw fail('Each file column can be mapped to only one field.');
  return mapping;
}

const FORMULA_START = /^[=@\t\r]|^[+-]/;

/**
 * Validates one CSV row. Returns { ok, value, errors, redacted }.
 * `redacted` is true when the row may hold a real identity, in which case the caller
 * must not persist the raw cell values.
 */
export function validateImportRow(cells, headers, mapping) {
  const errors = [];
  let redacted = false;
  const raw = {};
  for (const { field } of IMPORT_FIELDS) {
    const index = mapping[field] ? headers.indexOf(mapping[field]) : -1;
    raw[field] = index >= 0 ? String(cells[index] ?? '').trim() : '';
  }
  if (cells.length > headers.length) errors.push({ code: 'too_many_cells', message: 'Row has more cells than the header row.' });

  for (const { field, label } of IMPORT_FIELDS) {
    const value = raw[field];
    if (!value) continue;
    if (value.length > IMPORT_LIMITS.maxCellChars) errors.push({ code: 'value_too_long', field, message: `${label} is longer than ${IMPORT_LIMITS.maxCellChars} characters.` });
    const phoneLike = field === 'contactPhone' && /^\+[\d\s().-]+$/.test(value);
    if (FORMULA_START.test(value) && !phoneLike) {
      errors.push({ code: 'formula_like_value', field, message: `${label} starts with a spreadsheet formula character (= + - @).` });
    }
  }

  const value = {
    organizationName: raw.organizationName.replace(/\s+/g, ' '),
    legalName: raw.legalName.replace(/\s+/g, ' '),
    website: '', domain: '', region: '', specializations: [], relationshipType: 'unknown',
    contactName: raw.contactName.replace(/\s+/g, ' '), contactRole: raw.contactRole.replace(/\s+/g, ' '), contactEmail: '', contactPhone: '',
  };
  if (!value.organizationName) errors.push({ code: 'required', field: 'organizationName', message: 'Organization name is required.' });
  else if (value.organizationName.length > 160 || !nameKey(value.organizationName)) errors.push({ code: 'invalid', field: 'organizationName', message: 'Organization name must contain letters or digits and be at most 160 characters.' });
  if (value.legalName.length > 160) errors.push({ code: 'invalid', field: 'legalName', message: 'Legal name must be at most 160 characters.' });
  if (value.contactName.length > 120) errors.push({ code: 'invalid', field: 'contactName', message: 'Contact name must be at most 120 characters.' });
  if (value.contactRole.length > 120) errors.push({ code: 'invalid', field: 'contactRole', message: 'Contact role must be at most 120 characters.' });

  if (raw.website) {
    const url = normalizeSyntheticUrl(raw.website);
    if (!url) { redacted = true; errors.push({ code: 'not_synthetic', field: 'website', message: 'Website must use a reserved demo domain (example.com/.net/.org, .example, .test or .invalid).' }); }
    else { value.website = url; value.domain = normalizeDomain(url); }
  }
  if (raw.contactEmail) {
    if (!isSyntheticEmail(raw.contactEmail)) { redacted = true; errors.push({ code: 'not_synthetic', field: 'contactEmail', message: 'Contact email must use a reserved demo domain such as example.com. Real addresses are not accepted.' }); }
    else value.contactEmail = raw.contactEmail.toLowerCase();
  }
  if (raw.contactPhone) {
    const phone = normalizeSyntheticPhone(raw.contactPhone);
    if (!phone) { redacted = true; errors.push({ code: 'not_synthetic', field: 'contactPhone', message: 'Contact phone must be a fictional 555-01xx number. Real numbers are not accepted.' }); }
    else value.contactPhone = phone;
  }
  if (raw.region) {
    const region = raw.region.toUpperCase();
    if (!STATES.has(region)) errors.push({ code: 'invalid', field: 'region', message: 'Region must be a two-letter US state code.' });
    else value.region = region;
  }
  if (raw.specializations) {
    const items = [...new Set(raw.specializations.split(/[;|]/).map(headerKey).filter(Boolean))];
    const unknown = items.filter((item) => !SPECIALIZATIONS.has(item));
    if (unknown.length) errors.push({ code: 'invalid', field: 'specializations', message: `Unknown specialization(s). Allowed: ${[...SPECIALIZATIONS].join(', ')}.` });
    else value.specializations = items;
  }
  if (raw.relationshipType) {
    const type = headerKey(raw.relationshipType);
    if (!RELATIONSHIPS.has(type)) errors.push({ code: 'invalid', field: 'relationshipType', message: `Relationship type must be one of: ${[...RELATIONSHIPS].join(', ')}.` });
    else value.relationshipType = type;
  }

  const ok = errors.length === 0;
  const rowHash = ok ? createHash('sha256').update(JSON.stringify(value)).digest('hex') : null;
  return { ok, value: ok ? value : null, errors, redacted, rowHash };
}

export const fileHash = (text, mapping) => createHash('sha256')
  .update(text).update('\u0000').update(JSON.stringify(Object.entries(mapping).sort())).digest('hex');
