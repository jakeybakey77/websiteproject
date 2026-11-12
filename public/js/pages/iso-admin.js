// Internal ISO partner workspace: pipeline counts, organization list, CSV import
// with duplicate review, and the organization detail view (evidence-led vetting,
// explainable partner-priority score, history).
//
// The server owns every rule. This file only renders what the API returns and
// submits reviewer actions; nothing here decides a stage, a score or a tier.
// All text from the API is written with textContent, never parsed as markup.
import {
  ACQUISITION_SOURCES, CONTACT_STATUSES, DISQUALIFY_REASONS, EVIDENCE_CATEGORIES, EVIDENCE_SOURCE_TYPES, EVIDENCE_STATUSES,
  ISO_SPECIALIZATIONS, ISO_STAGES, ISO_TIERS, REFERRAL_VOLUME_BANDS, RELATIONSHIP_TYPES, VERIFICATION_STATUSES, YEARS_ACTIVE_BANDS, isoLabel,
} from '../config/iso-pipeline.js';
import { el } from '../lib/dom.js';
import { formatDate } from '../lib/format.js';
import { createReferralsPanel } from './iso-referrals.js';
import * as api from '../services/iso-service.js';

const $ = (id) => document.getElementById(id);
const listView = $('view-list');
const detailView = $('view-detail');
const pageStatus = $('page-status');
const filters = $('filters');

let session = null;
let current = null; // organization detail currently shown
let organizations = null;
let activeSection = 'overview';
let organizationSearch = '';

const tag = (kind, label) => el('span', { class: `tag tag-${kind}`, text: label });
const stageTag = (stage) => tag(stage, isoLabel(ISO_STAGES, stage));
const verificationTag = (status) => tag(status, isoLabel(VERIFICATION_STATUSES, status));
const tierBadge = (tier) => el('span', { class: `tier tier-${tier ?? 'none'}`, text: tier ?? '–', title: tier ? `Partner-priority tier ${tier}` : 'Not scored' });
const dateTime = (iso) => (iso ? `${formatDate(iso)} ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '');
const pair = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', typeof value === 'string' || typeof value === 'number' ? { text: String(value) } : {}, typeof value === 'object' ? value : null));
const options = (list, placeholder) => [placeholder != null && el('option', { value: '', text: placeholder }), ...list.map((o) => el('option', { value: o.value, text: o.label }))];

/**
 * Small form builder. `fields`: [{ name, label, type: text|textarea|select|date, options, placeholder, span, value }].
 * `onSubmit(values)` returns a promise; errors from the server are shown inline.
 */
function miniForm({ fields, submitLabel, onSubmit, note }) {
  const status = el('span', { class: 'form-status', role: 'status', 'aria-live': 'polite' });
  const uid = Math.random().toString(36).slice(2, 8);
  const button = el('button', { type: 'submit', class: 'button button-small', text: submitLabel });
  const form = el('form', { class: 'mini-form', novalidate: true },
    fields.map((f) => {
      const id = `${f.name}-${uid}`;
      let control;
      if (f.type === 'select') control = el('select', { id, name: f.name }, options(f.options, f.placeholder ?? 'Select'));
      else if (f.type === 'textarea') control = el('textarea', { id, name: f.name, rows: 2, maxlength: f.maxLength ?? 500, placeholder: f.placeholder });
      else control = el('input', { id, name: f.name, type: f.type ?? 'text', maxlength: f.maxLength ?? 300, placeholder: f.placeholder, autocomplete: 'off' });
      if (f.value != null) control.value = f.value;
      return el('div', { class: f.span ? 'span' : '', 'data-field': f.name }, el('label', { for: id, text: f.label }), control);
    }),
    el('div', { class: 'actions' }, button, status),
    note && el('p', { class: 'dialog-note span', text: note }),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Saving…';
    try {
      await onSubmit(values, form);
    } catch (error) {
      status.className = 'form-status is-error';
      status.textContent = error.message;
      button.disabled = false;
    }
  });
  return form;
}

/** replaceChildren() does not skip `false`, so conditional children are filtered first. */
const setChildren = (node, ...children) => node.replaceChildren(...children.flat().filter((child) => child != null && child !== false));

const disclose = (summary, ...children) => el('details', { class: 'disclose' }, el('summary', { text: summary }), ...children);

// List view --------------------------------------------------------------------

function renderBars(listId, entries) {
  const max = Math.max(1, ...entries.map(([, count]) => count));
  $(listId).replaceChildren(...entries.map(([label, count]) => {
    const fill = el('span', { class: 'fill' });
    fill.style.setProperty('--share', `${(count / max) * 100}%`);
    return el('li', {}, el('span', { text: label }), el('span', { class: 'count', text: count }), el('span', { class: 'track' }, fill));
  }));
}

async function renderAnalytics() {
  const a = await api.getAnalytics();
  const stat = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }));
  $('iso-stats').replaceChildren(
    stat('Synthetic partner records', a.totalOrganizations),
    stat('Review backlog', a.reviewBacklog),
    stat('Outreach ready', a.outreachReady),
    stat('Duplicates awaiting review', a.imports.duplicateReviewPending),
    stat('Open follow-ups', a.followUps.open),
  );
  const referrals = a.referrals;
  $('referral-analytics').replaceChildren(
    stat('Referred inquiries', referrals.referredInquiries),
    stat('Direct / unattributed inquiries', referrals.directOrUnattributedInquiries),
    stat('Partners credited', referrals.organizationsWithCredit),
    stat('Active demo referral links', referrals.activeReferralCodes));
  renderBars('stage-bars', ISO_STAGES.map((s) => [s.label, a.byStage[s.value] ?? 0]));
  renderBars('tier-bars', [...ISO_TIERS.map((t) => [`Tier ${t}`, a.byTier[t] ?? 0]), ['Not scored', a.byTier.unscored ?? 0]]);
  renderBars('source-bars', ACQUISITION_SOURCES.map((s) => [s.label, a.bySource[s.value] ?? 0]));
  $('health-stats').replaceChildren(
    stat('Backlog with no reviewer', a.unassignedInBacklog),
    stat('Verified by a reviewer', a.byVerification.verified),
    stat('Evidence items confirmed', `${a.evidence.confirmed} of ${a.evidence.total}`),
    stat('Manual tier overrides', a.tierOverrides),
    stat('Overdue follow-ups', a.followUps.overdue),
    stat('Import rows rejected', a.imports.rowsRejected),
    stat('Response-to-partnership rate', 'No data'),
  );
  $('not-measured').replaceChildren(el('strong', { text: 'Not yet measurable: ' }), a.notMeasured.reason);
}

const filterQuery = () => {
  const query = Object.fromEntries([...new FormData(filters)].filter(([, value]) => value !== ''));
  if (query.sort === 'name') query.dir = 'asc';
  return query;
};

async function renderList() {
  const query = filterQuery();
  $('export-csv').href = api.exportUrl(query);
  organizations = await api.listOrganizations(query);
  $('org-rows').replaceChildren(...organizations.map((o) => {
    const href = `#org=${encodeURIComponent(o.id)}`;
    return el('tr', {
      class: 'iso-openable-row', role: 'row',
      onclick: (event) => {
        // Keep the name link's native navigation; clicks on the rest of the row open the same record.
        if (event.target.closest('a, button, input, select, textarea')) return;
        location.hash = href;
      },
    },
      el('td', { role: 'cell', class: 'wrap business' },
        el('a', { class: 'iso-row-link', href, text: o.displayName, 'aria-label': `Open ${o.displayName}, ${o.id}` })),
      el('td', { role: 'cell', class: 'wide', text: o.domain || '—' }),
      el('td', { role: 'cell', text: o.region || '—' }),
      el('td', { role: 'cell',}, stageTag(o.stage)),
      el('td', { role: 'cell', class: 'wide' }, verificationTag(o.verificationStatus)),
      el('td', { role: 'cell',}, tierBadge(o.tier), o.tierOverridden && el('span', { class: 'tier-note', text: 'override' })),
      el('td', { role: 'cell', class: 'num', text: o.score ?? '—' }),
      el('td', { role: 'cell', class: 'wide', text: isoLabel(ACQUISITION_SOURCES, o.acquisitionSource) }),
      el('td', { role: 'cell', class: 'wide', text: o.assignedReviewer || 'Unassigned' }),
      el('td', { role: 'cell', class: 'wide', text: formatDate(o.updatedAt) }),
    );
  }));
  const filtered = Object.keys(query).some((key) => !['sort', 'dir'].includes(key));
  $('result-count').textContent = `${organizations.length} organization${organizations.length === 1 ? '' : 's'}${filtered ? ' match these filters' : ''}.`;
  const empty = $('empty');
  empty.hidden = organizations.length > 0;
  empty.textContent = filtered ? 'No organizations match these filters. Clear the filters to see all of them.'
    : 'No partner records yet. Submit the public partner demo form or import the sample CSV below.';
}

// CSV import -------------------------------------------------------------------

let pendingUpload = null; // { filename, contentBase64 }

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const OUTCOME_LABELS = { accepted: 'Will be created', rejected: 'Rejected', duplicate_review: 'Possible duplicate → review queue', replayed: 'Already imported (skipped)' };
const OUTCOME_TAGS = { accepted: 'confirmed', rejected: 'failed', duplicate_review: 'in_review', replayed: 'muted' };
const MATCH_LABELS = { exact_domain: 'same domain', exact_name: 'same name', near_name: 'similar name' };

function renderPreview(preview) {
  const status = $('import-status');
  $('import-step').textContent = '2 of 3 · Preview and mapping';
  $('import-form').hidden = true;
  const s = preview.summary;
  const mappingSelects = preview.fields.map((f) => {
    const select = el('select', { id: `map-${f.field}`, 'data-field': f.field }, el('option', { value: '', text: f.required ? 'Choose a column' : 'Not in file' }),
      preview.headers.map((h) => el('option', { value: h, text: h })));
    select.value = preview.mapping[f.field] ?? '';
    select.addEventListener('change', () => runPreview(readMapping()).catch((error) => { status.textContent = error.message; }));
    return el('div', {}, el('label', { for: `map-${f.field}`, text: `${f.label}${f.required ? ' (required)' : ''}` }), select);
  });
  const readMapping = () => Object.fromEntries([...document.querySelectorAll('#import-preview select[data-field]')].map((sel) => [sel.dataset.field, sel.value]));
  const commit = el('button', { type: 'button', class: 'button button-small', text: `Import ${s.accepted} new record${s.accepted === 1 ? '' : 's'}`, disabled: Boolean(preview.alreadyImported) || s.totalRows === s.replayed + s.rejected && s.duplicateReview === 0 });
  commit.addEventListener('click', async () => {
    commit.disabled = true;
    status.textContent = 'Importing…';
    try {
      const result = await api.commitImport({ ...pendingUpload, mapping: readMapping() });
      const b = result.batch;
      status.textContent = result.replayed
        ? `This exact file was already imported (${b.id}). Nothing was added.`
        : `Imported ${b.acceptedRows} of ${b.totalRows} rows: ${b.rejectedRows} rejected, ${b.duplicateRows} sent to duplicate review, ${b.replayedRows} already imported.`;
      pendingUpload = null;
      $('import-preview').replaceChildren();
      $('import-form').reset();
      $('import-form').hidden = false;
      $('import-step').textContent = '3 of 3 · Result';
      await Promise.all([renderAnalytics(), renderList(), renderImports()]);
    } catch (error) {
      status.textContent = error.message;
      commit.disabled = false;
    }
  });
  setChildren($('import-preview'),
    preview.alreadyImported && el('p', { class: 'callout info', text: `This exact file and column mapping was already imported on ${formatDate(preview.alreadyImported.createdAt)} (${preview.alreadyImported.batchId}). Importing it again adds nothing.` }),
    el('h3', { class: 'panel-sub', text: 'Column mapping' }),
    el('div', { class: 'mapping' }, mappingSelects),
    el('dl', { class: 'insight-stats' }, pair('Rows in file', s.totalRows), pair('Will be created', s.accepted), pair('To duplicate review', s.duplicateReview), pair('Rejected', s.rejected), pair('Already imported', s.replayed)),
    el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Import preview rows' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Row' }), el('th', { scope: 'col', text: 'Organization' }), el('th', { scope: 'col', text: 'Outcome' }), el('th', { scope: 'col', class: 'wrap', text: 'Why' }))),
      el('tbody', {}, preview.rows.map((r) => el('tr', {},
        el('td', { text: r.rowNumber }),
        el('td', { class: 'wrap', text: r.organizationName || '—' }),
        el('td', {}, tag(OUTCOME_TAGS[r.outcome], OUTCOME_LABELS[r.outcome])),
        el('td', { class: 'wrap', text: r.errors.length ? r.errors.map((e) => e.message).join(' ')
          : r.outcome === 'replayed' ? 'An identical row was handled in an earlier import.'
          : r.match ? `Matches ${r.match.displayName ?? 'an earlier row'} (${MATCH_LABELS[r.match.matchType]}${r.match.rowNumber ? `, row ${r.match.rowNumber}` : ''}).` : '' }),
      ))))),
    preview.rows.length < s.totalRows && el('p', { class: 'result-count', text: `Showing the first ${preview.rows.length} of ${s.totalRows} rows.` }),
    el('div', { class: 'mini-form' }, el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'button button-secondary button-small', text: 'Back to upload', onclick: () => {
        pendingUpload = null;
        $('import-preview').replaceChildren();
        $('import-form').hidden = false;
        $('import-step').textContent = '1 of 3 · Upload';
        status.textContent = '';
        $('import-file').focus();
      } }), commit)),
  );
  status.textContent = 'Preview only. Nothing has been saved yet.';
}

async function runPreview(mapping) {
  const upload = pendingUpload;
  const preview = await api.previewImport({ ...upload, ...(mapping ? { mapping } : {}) });
  if (pendingUpload === upload) renderPreview(preview);
}

async function renderImports() {
  const { imports, duplicateReview } = await api.getImports();
  $('import-history').replaceChildren(imports.length === 0
    ? el('p', { class: 'empty', text: 'No imports yet.' })
    : el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Import history' }, el('table', {},
      el('thead', {}, el('tr', {}, ['Batch', 'File', 'Imported', 'By', 'Rows', 'Created', 'Rejected', 'Duplicates', 'Replayed rows', 'File replays'].map((h) => el('th', { scope: 'col', text: h })))),
      el('tbody', {}, imports.map((b) => el('tr', {}, [b.id, b.filename, formatDate(b.createdAt), b.createdBy, b.totalRows, b.acceptedRows, b.rejectedRows, b.duplicateRows, b.replayedRows, b.replayCount]
        .map((value, index) => el('td', { class: index === 1 ? 'wrap' : '', text: value }))))))));

  $('duplicate-queue').replaceChildren(duplicateReview.length === 0
    ? el('p', { class: 'empty', text: 'No possible duplicates are waiting for review.' })
    : el('ul', { class: 'items' }, duplicateReview.map((row) => el('li', {},
      el('div', { class: 'item-head' }, el('span', { text: row.data.organizationName }), tag('in_review', `Possible duplicate: ${MATCH_LABELS[row.matchType]}`)),
      el('p', { class: 'item-meta' }, `Row ${row.rowNumber} of ${row.batchFilename}. Matches `,
        el('a', { href: `#org=${encodeURIComponent(row.matchedOrganizationId)}`, text: row.matchedName ?? row.matchedOrganizationId }),
        row.matchedDomain ? ` (${row.matchedDomain}).` : '.',
        ` Imported row: ${[row.data.domain, row.data.region, row.data.contactName && `contact ${row.data.contactName}`].filter(Boolean).join(' · ') || 'no further details'}.`),
      miniForm({
        submitLabel: 'Record decision',
        fields: [
          { name: 'decision', label: 'Decision', type: 'select', placeholder: 'Choose a decision', options: [
            { value: 'create_separate', label: 'Different organization: create a separate record' },
            { value: 'attach_contact', label: 'Same organization: add this row’s contact to it' },
            { value: 'skip', label: 'Same organization: nothing to add' }] },
          { name: 'note', label: 'Why (required)', placeholder: 'What you checked' },
        ],
        onSubmit: async (values) => {
          await api.resolveImportRow(row.id, values);
          await Promise.all([renderAnalytics(), renderList(), renderImports()]);
        },
      }),
    ))));
}

// Detail view ------------------------------------------------------------------

/** Runs a reviewer action that returns the refreshed detail, then re-renders. */
const act = async (promise) => {
  const detail = await promise;
  if (current?.organization.id !== detail.organization.id || detailView.hidden) return;
  current = detail;
  renderDetail();
  detailView.querySelector('[aria-pressed="true"]').focus();
};

function workflowPanel(d) {
  const o = d.organization;
  const stageOptions = ISO_STAGES.filter((s) => d.allowedStages.includes(s.value));
  const stageForm = miniForm({
    submitLabel: 'Change stage',
    fields: [
      { name: 'stage', label: 'Move to', type: 'select', options: stageOptions, placeholder: 'Choose next stage' },
      { name: 'reason', label: 'Disqualification reason', type: 'select', options: DISQUALIFY_REASONS, placeholder: 'Only if disqualifying' },
      { name: 'note', label: 'Note', type: 'textarea', span: true, placeholder: 'Required when disqualifying, archiving or reopening' },
    ],
    onSubmit: (values) => act(api.orgAction(o.id, 'stage', values)),
    note: 'Stages are relationship records kept by reviewers. This workspace sends no email or messages; “Contacted” only records something done outside the system.',
  });
  const mine = o.assignedReviewer === session.username;
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'workflow-title' },
    el('h2', { id: 'workflow-title', text: 'Review workflow' }),
    el('dl', { class: 'ledger' },
      pair('Relationship stage', stageTag(o.stage)),
      o.disqualifyReason && pair('Disqualification reason', isoLabel(DISQUALIFY_REASONS, o.disqualifyReason)),
      pair('Business verification', verificationTag(o.verificationStatus)),
      pair('Assigned reviewer', o.assignedReviewer || 'Unassigned')),
    el('div', { class: 'mini-form' }, el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'button button-quiet button-small', id: 'assign-toggle', text: mine ? 'Unassign me' : 'Assign to me',
        onclick: () => act(api.orgAction(o.id, 'assign', { reviewer: mine ? '' : session.username })).catch((error) => { pageStatus.textContent = error.message; }) }))),
    stageOptions.length ? stageForm : el('p', { class: 'dialog-note', text: 'No further stage changes are available from this stage.' }),
  );
}

function verificationPanel(d) {
  const o = d.organization;
  const form = miniForm({
    submitLabel: 'Update verification',
    fields: [
      { name: 'status', label: 'Business verification', type: 'select', options: VERIFICATION_STATUSES.filter((s) => s.value !== o.verificationStatus), placeholder: 'Choose state' },
      { name: 'note', label: 'What was checked', type: 'textarea', span: true, placeholder: 'Required for verified or failed' },
    ],
    onSubmit: (values) => act(api.orgAction(o.id, 'verification', values)),
    note: '“Verified” needs at least one independently confirmed identity item and no confirmed red flag. It is a reviewer’s conclusion, not something the score can grant.',
  });
  const categories = EVIDENCE_CATEGORIES.map((item) => {
    const records = d.evidence.filter((entry) => entry.category === item.value);
    return el('li', {}, el('strong', { text: item.label }),
      records.length ? records.map((entry) => tag(entry.status, isoLabel(EVIDENCE_STATUSES, entry.status))) : el('span', { text: 'No evidence recorded' }));
  });
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'verification-title' },
    el('h2', { id: 'verification-title', text: 'Business verification' }),
    el('p', { class: 'dialog-note', text: 'Relationship stage and verification are tracked independently.' }),
    el('div', { class: 'detail-tags' }, VERIFICATION_STATUSES.map((state) => verificationTag(state.value))),
    form,
    el('h3', { class: 'panel-sub', text: 'Evidence and vetting checklist' }),
    el('ul', { class: 'items' }, categories));
}

function scorePanel(d) {
  const o = d.organization;
  const b = d.scoreBreakdown;
  const overrideForm = miniForm({
    submitLabel: 'Apply override',
    fields: [
      { name: 'tier', label: 'Override tier', type: 'select', options: ISO_TIERS.map((t) => ({ value: t, label: `Tier ${t}` })), placeholder: 'Choose tier' },
      { name: 'justification', label: 'Justification (required)', type: 'textarea', span: true },
    ],
    onSubmit: (values) => act(api.orgAction(o.id, 'score/override', values)),
    note: 'An override changes the displayed tier only. The computed score, its reasons and the evidence stay as they are, and the override is recorded in history with your name.',
  });
  const clearForm = miniForm({
    submitLabel: 'Clear override',
    fields: [{ name: 'justification', label: 'Why the override is being removed (required)', type: 'textarea', span: true }],
    onSubmit: (values) => act(api.orgAction(o.id, 'score/override/clear', values)),
  });
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'score-title' },
    el('h2', { id: 'score-title' }, 'Partner-priority score ', el('span', { class: 'note', text: '(ranking aid)' })),
    el('p', { class: 'result-count', text: 'Rules-based ordering of which partner records to review first. Not a credit score, not a prediction of results, and never used for merchant screening or funding decisions.' }),
    b ? [
      el('div', { class: 'score-head' },
        el('span', { class: 'score-number', id: 'score-number' }, String(b.score), el('small', { text: ' / 100' })),
        el('span', {}, 'Tier ', tierBadge(o.tier)),
        el('span', { class: 'item-meta' }, 'Rules ', el('code', { text: b.rulesVersion }), ` · assessed ${b.asOf}`)),
      o.tierOverridden && el('p', { class: 'callout info', id: 'override-banner' },
        `Tier manually overridden to ${o.override.tier} by ${o.override.by} on ${formatDate(o.override.at)} (computed tier is ${o.computedTier}). Justification: ${o.override.justification}`),
      el('ul', { class: 'factors' }, b.factors.map((f) => {
        const fill = el('span', { class: 'fill' });
        fill.style.setProperty('--share', `${(f.points / f.max) * 100}%`);
        return el('li', {},
          el('div', { class: 'factor-top' }, el('span', { text: f.label }), el('span', { text: `${f.points} / ${f.max}` })),
          el('span', { class: 'track' }, fill),
          el('ul', { class: 'reasons' }, f.reasons.map((r) => el('li', {}, `${r.text} `, el('code', { text: r.code })))));
      })),
      el('ul', { class: 'reasons' }, b.notes.map((n) => el('li', {}, `${n.text} `, el('code', { text: n.code })))),
    ] : el('p', { class: 'empty', text: 'Not scored yet.' }),
    el('div', { class: 'mini-form' }, el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'button button-quiet button-small', text: 'Recalculate now',
        onclick: () => act(api.orgAction(o.id, 'score/recalculate')).then(() => { pageStatus.textContent = 'Score recalculated from current evidence.'; }).catch((error) => { pageStatus.textContent = error.message; }) }))),
    disclose(o.tierOverridden ? 'Change or clear the manual override' : 'Manually override the tier', overrideForm, o.tierOverridden && clearForm),
    disclose(`Score history (${d.scoreHistory.length})`, el('ul', { class: 'history' }, d.scoreHistory.map((s) => el('li', {},
      el('strong', { text: s.kind === 'computed' ? `Computed ${s.score} → tier ${s.tier}` : s.kind === 'override' ? `Override to tier ${s.effectiveTier} (computed ${s.score}, tier ${s.tier})` : `Override cleared (back to tier ${s.tier})` }),
      el('span', { class: 'who', text: ` · ${s.actor} · ${dateTime(s.assessedAt)} · ` }), el('code', { text: s.rulesVersion }),
      s.justification && el('div', { class: 'item-notes', text: s.justification }))))),
  );
}

function evidencePanel(d) {
  const o = d.organization;
  const items = d.evidence.map((e) => el('li', { 'data-evidence': e.id },
    el('div', { class: 'item-head' }, el('span', { text: isoLabel(EVIDENCE_CATEGORIES, e.category) }), tag(e.status, isoLabel(EVIDENCE_STATUSES, e.status))),
    el('p', { text: e.claim }),
    el('p', { class: 'item-meta' }, `${isoLabel(EVIDENCE_SOURCE_TYPES, e.sourceType)}${e.title ? ` · ${e.title}` : ''}${e.observedOn ? ` · observed ${e.observedOn}` : ''} · added by ${e.createdBy}`,
      e.url && [' · ', el('code', { text: e.url })],
      e.reviewedBy && ` · reviewed by ${e.reviewedBy} on ${formatDate(e.reviewedAt)}`),
    e.notes && el('p', { class: 'item-notes', text: e.notes }),
    disclose(e.status === 'asserted' ? 'Review this item' : 'Change the review outcome', miniForm({
      submitLabel: 'Save review',
      fields: [
        { name: 'status', label: 'Outcome', type: 'select', placeholder: 'Choose outcome', options: EVIDENCE_STATUSES.filter((s) => s.value !== 'asserted' && s.value !== e.status) },
        { name: 'independentSource', label: 'Independent source used', placeholder: 'Required to confirm self-reported or imported statements' },
        { name: 'notes', label: 'How it was checked (required)', type: 'textarea', span: true, maxLength: 1000 },
      ],
      onSubmit: (values) => act(api.reviewEvidence(e.id, values)),
    })),
  ));
  const checklist = EVIDENCE_CATEGORIES.filter((c) => !['red_flag', 'court_record_context'].includes(c.value)).map((c) => {
    const found = d.evidence.filter((e) => e.category === c.value);
    const state = found.some((e) => e.status === 'confirmed') ? 'confirmed' : found.some((e) => e.status === 'asserted') ? 'asserted' : 'none';
    return el('li', {}, tag(state === 'none' ? 'muted' : state, state === 'confirmed' ? 'Confirmed' : state === 'asserted' ? 'Asserted only' : 'Missing'), ` ${c.label}`);
  });
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'evidence-title' },
    el('h2', { id: 'evidence-title', text: 'Evidence and vetting checklist' }),
    el('ul', { class: 'flags', id: 'checklist' }, checklist),
    el('h3', { class: 'panel-sub', text: `Evidence on file (${d.evidence.length})` }),
    items.length ? el('ul', { class: 'items', id: 'evidence-items' }, items) : el('p', { class: 'empty', text: 'No evidence recorded yet.' }),
    disclose('Add evidence', miniForm({
      submitLabel: 'Add evidence',
      fields: [
        { name: 'category', label: 'Checklist item', type: 'select', options: EVIDENCE_CATEGORIES, placeholder: 'Choose item' },
        { name: 'sourceType', label: 'Source type', type: 'select', options: EVIDENCE_SOURCE_TYPES.filter((s) => !['self_reported', 'csv_import'].includes(s.value)), placeholder: 'Choose source' },
        { name: 'title', label: 'Source title', maxLength: 160 },
        { name: 'url', label: 'Source URL (reserved demo domains only)', placeholder: 'https://registry.example/…' },
        { name: 'observedOn', label: 'Date observed', type: 'date' },
        { name: 'claim', label: 'What the source shows (required)', type: 'textarea', span: true },
        { name: 'notes', label: 'Analyst notes', type: 'textarea', span: true, maxLength: 1000 },
      ],
      onSubmit: (values) => act(api.orgAction(o.id, 'evidence', values)),
      note: 'New evidence is saved as an assertion. Confirming it is a separate review step. URLs are stored as references and never fetched. Court-record context earns no points and never classifies an organization as a funder or non-funder.',
    })),
  );
}

function contactsPanel(d) {
  const o = d.organization;
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'contacts-title' },
    el('h2', { id: 'contacts-title' }, 'Contacts ', el('span', { class: 'note', text: '(fictional)' })),
    d.contacts.length ? el('ul', { class: 'items', id: 'contact-items' }, d.contacts.map((c) => {
      const select = el('select', { 'aria-label': `Status for ${c.name || c.email || 'contact'}` }, options(CONTACT_STATUSES));
      select.value = c.status;
      select.addEventListener('change', () => act(api.setContactStatus(c.id, select.value)).catch((error) => { pageStatus.textContent = error.message; }));
      return el('li', {},
        el('div', { class: 'item-head' }, el('span', { text: c.name || '(no name)' }), tag(c.status === 'active' ? 'confirmed' : 'warn', isoLabel(CONTACT_STATUSES, c.status))),
        el('p', { class: 'item-meta', text: [c.role, c.email, c.phone].filter(Boolean).join(' · ') || 'No further details' }),
        el('div', { class: 'mini-form' }, el('div', {}, select)));
    })) : el('p', { class: 'empty', text: 'No contacts on this record.' }),
    disclose('Add a contact', miniForm({
      submitLabel: 'Add contact',
      fields: [
        { name: 'name', label: 'Name', maxLength: 120 }, { name: 'role', label: 'Role', maxLength: 120 },
        { name: 'email', label: 'Email (example.com etc.)', maxLength: 160 }, { name: 'phone', label: 'Phone (555-01xx)', maxLength: 30 },
      ],
      onSubmit: (values) => act(api.orgAction(o.id, 'contacts', values)),
      note: 'Only fictional contact details are accepted: reserved email domains and 555-01xx phone numbers.',
    })),
  );
}

const ACTIVITY_LABELS = {
  created: 'Record created', stage_change: 'Stage changed', verification_change: 'Verification changed', assignment: 'Reviewer assignment changed',
  contact_added: 'Contact added', contact_status_changed: 'Contact status changed', evidence_added: 'Evidence added', evidence_reviewed: 'Evidence reviewed',
  score_recalculated: 'Score recalculated', score_override: 'Tier overridden', score_override_cleared: 'Tier override cleared', duplicate_review: 'Duplicate review decision',
  note: 'Note', follow_up: 'Follow-up task',
  referral_code_issued: 'Demo referral link issued', referral_code_revoked: 'Demo referral link revoked',
  referral_code_rotated: 'Demo referral link rotated',
};
function activitySummary(a) {
  const d = a.detail ?? {};
  if (a.type === 'stage_change') return `${isoLabel(ISO_STAGES, d.from)} → ${isoLabel(ISO_STAGES, d.to)}${d.reason ? ` (${isoLabel(DISQUALIFY_REASONS, d.reason)})` : ''}`;
  if (a.type === 'verification_change') return `${isoLabel(VERIFICATION_STATUSES, d.from)} → ${isoLabel(VERIFICATION_STATUSES, d.to)}`;
  if (a.type === 'score_recalculated') return `${d.previousScore ?? '–'} → ${d.score} (tier ${d.tier}), trigger: ${d.trigger}`;
  if (a.type === 'score_override') return `computed tier ${d.computedTier} → override ${d.overrideTier}`;
  if (a.type === 'assignment') return `${d.from || 'unassigned'} → ${d.to || 'unassigned'}`;
  if (a.type === 'evidence_reviewed') return `${isoLabel(EVIDENCE_CATEGORIES, d.category)}: ${d.from} → ${d.to}`;
  if (a.type === 'evidence_added') return isoLabel(EVIDENCE_CATEGORIES, d.category);
  if (a.type === 'duplicate_review') return `decision: ${d.decision}`;
  if (a.type === 'follow_up') return `due ${a.dueOn}${a.completedAt ? ` · completed by ${a.completedBy} on ${formatDate(a.completedAt)}` : ' · open'}`;
  return '';
}

function activityPanel(d) {
  const o = d.organization;
  return el('section', { class: 'sheet panel', 'aria-labelledby': 'activity-title' },
    el('h2', { id: 'activity-title', text: 'Notes, follow-ups and history' }),
    miniForm({
      submitLabel: 'Add',
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: [{ value: 'note', label: 'Note' }, { value: 'follow_up', label: 'Follow-up task (manual)' }], value: 'note', placeholder: null },
        { name: 'dueOn', label: 'Due date (follow-ups)', type: 'date' },
        { name: 'body', label: 'Text', type: 'textarea', span: true, maxLength: 1000 },
      ],
      onSubmit: (values) => act(api.orgAction(o.id, 'activities', values)),
      note: 'Follow-ups are reminders for a person. Nothing is sent to the partner.',
    }),
    el('ul', { class: 'history', id: 'activity-items' }, d.activity.map((a) => el('li', {},
      el('strong', { text: ACTIVITY_LABELS[a.type] ?? a.type }), activitySummary(a) && ` — ${activitySummary(a)}`,
      el('span', { class: 'who', text: ` · ${a.actor} · ${dateTime(a.at)}` }),
      a.body && el('div', { class: 'item-notes', text: a.body }),
      a.type === 'follow_up' && !a.completedAt && el('button', { type: 'button', class: 'link-button', text: 'Mark completed',
        onclick: () => act(api.completeFollowUp(a.id)).catch((error) => { pageStatus.textContent = error.message; }) })))),
    disclose(`Audit log entries for this record (${d.audit.length})`, el('ul', { class: 'history' }, d.audit.map((e) => el('li', {},
      el('code', { text: e.action }), el('span', { class: 'who', text: ` · ${e.actor} · ${dateTime(e.at)}` }))))),
  );
}

function masterList(selected) {
  const list = el('ul');
  const search = el('input', { id: 'organization-search', type: 'search', placeholder: 'Name, domain or reference', value: organizationSearch });
  function update() {
    organizationSearch = search.value;
    const term = organizationSearch.trim().toLowerCase();
    const records = (organizations ?? []).map((record) => record.id === selected.id ? selected : record);
    if (!records.some((record) => record.id === selected.id)) records.unshift(selected);
    list.replaceChildren(...records.filter((record) =>
      [record.displayName, record.domain, record.id].some((value) => value?.toLowerCase().includes(term))
    ).map((record) => el('li', {}, el('a', {
      href: '#org=' + encodeURIComponent(record.id),
      'aria-current': record.id === selected.id ? 'true' : null,
    }, el('strong', { text: record.displayName }), el('small', { text: record.domain || record.id }),
    el('small', {}, isoLabel(ISO_STAGES, record.stage),
      el('span', { class: 'master-tier', text: ' · ' + (record.tier ? 'Tier ' + record.tier : 'Not scored') }))))));
    if (!list.childElementCount) list.append(el('li', { class: 'empty', text: 'No organizations match your search.' }));
  }
  search.addEventListener('input', update);
  update();
  return el('aside', { class: 'iso-master', 'aria-labelledby': 'organization-list-title' },
    el('h2', { id: 'organization-list-title', text: 'Organizations' }),
    el('label', { for: 'organization-search', text: 'Search' }), search, list);
}

function renderDetail() {
  const d = current;
  const o = d.organization;
  const app = o.application ?? {};
  document.title = `${o.displayName} | ISO partners (demo)`;
  const tier = el('span', { class: 'detail-tier' }, 'Tier ', tierBadge(o.tier),
    o.tierOverridden && tag('warn', 'Tier manually overridden'));
  const title = el('div', { class: 'detail-head' },
      el('a', { class: 'back-link', href: '#', text: '← All ISO partners' }),
      el('h1', { id: 'detail-title', tabindex: '-1', text: o.displayName }),
      el('div', { class: 'detail-tags' }, el('code', { text: o.id }), stageTag(o.stage), verificationTag(o.verificationStatus),
        tier, tag('muted', 'Synthetic record')));
  const duplicates = d.possibleDuplicates.length > 0 && el('div', { class: 'callout', id: 'duplicate-warning' },
      el('strong', { text: 'Possible duplicate records. ' }), 'These were not merged. Compare them and disqualify or archive one if they are the same organization.',
      el('ul', {}, d.possibleDuplicates.map((p) => el('li', {}, el('a', { href: `#org=${encodeURIComponent(p.organizationId)}`, text: p.displayName }),
        ` — ${MATCH_LABELS[p.matchType]}${p.domain ? `, ${p.domain}` : ''}, ${isoLabel(ISO_STAGES, p.stage)}`))));
  const profile = el('section', { class: 'sheet panel', 'aria-labelledby': 'profile-title' },
        el('h2', { id: 'profile-title', text: 'Organization' }),
        el('dl', { class: 'ledger' },
          pair('Display name', o.displayName), pair('Legal name', o.legalName || 'Not recorded'), pair('Website', o.website || 'Not recorded'), pair('Normalized domain', o.domain || 'Not recorded'),
          pair('Region', o.region || 'Not recorded'), pair('Relationship type', isoLabel(RELATIONSHIP_TYPES, o.relationshipType)),
          pair('Specializations', o.specializations.map((s) => isoLabel(ISO_SPECIALIZATIONS, s)).join(', ') || 'Not recorded'),
          pair('Acquisition source', isoLabel(ACQUISITION_SOURCES, o.acquisitionSource)),
          o.importBatchId && pair('Import batch', o.importBatchId),
          o.acquisitionSource === 'public_application' && pair('Campaign source', [o.attribution.source, o.attribution.medium, o.attribution.campaign].filter(Boolean).join(' / ') || 'direct'),
          app.referralVolume && pair('Stated monthly referrals', `${isoLabel(REFERRAL_VOLUME_BANDS, app.referralVolume)} (self-reported)`),
          app.yearsActive && pair('Stated time active', `${isoLabel(YEARS_ACTIVE_BANDS, app.yearsActive)} (self-reported)`),
          pair('Created', dateTime(o.createdAt)), pair('Last updated', dateTime(o.updatedAt))));
  const referrals = createReferralsPanel(o.id);
  const sections = [
    ['overview', 'Overview', profile, workflowPanel(d)],
    ['verification', 'Verification', verificationPanel(d)],
    ['score', 'Score', scorePanel(d)],
    ['evidence', 'Evidence', evidencePanel(d)],
    ['contacts', 'Contacts', contactsPanel(d)],
    ['activity', 'Activity', activityPanel(d)],
    ['referrals', 'Referrals', referrals.panel],
  ];
  const controls = el('div', { class: 'detail-tabs', role: 'group', 'aria-label': 'Organization details' });
  const panels = sections.map(([key, label, ...content]) =>
    el('div', { class: 'detail-grid', id: 'detail-section-' + key, 'aria-label': label }, content));
  const buttons = sections.map(([key, label], index) => el('button', {
    type: 'button', class: 'button button-quiet button-small', text: label,
    'aria-controls': panels[index].id,
    onclick: () => { activeSection = key; selectSection(); },
  }));
  function selectSection() {
    sections.forEach(([key], index) => {
      const selected = key === activeSection;
      buttons[index].setAttribute('aria-pressed', String(selected));
      panels[index].hidden = !selected;
    });
    tier.hidden = activeSection === 'referrals';
    detailView.classList.toggle('showing-referrals', tier.hidden);
    if (activeSection === 'referrals') referrals.refresh();
  }
  selectSection();
  controls.append(...buttons);
  setChildren(detailView, el('div', { class: 'iso-detail-layout' },
    masterList(o), el('article', { class: 'sheet panel' }, title, duplicates, controls, panels)));
}

// Routing ----------------------------------------------------------------------

async function route() {
  const hash = location.hash;
  const match = hash.match(/^#org=(.+)$/);
  pageStatus.textContent = '';
  try {
    if (match) {
      const detail = await api.getOrganization(decodeURIComponent(match[1]));
      if (location.hash !== hash) return;
      if (!organizations) organizations = await api.listOrganizations(filterQuery()).catch(() => []);
      if (location.hash !== hash) return;
      if (current?.organization.id !== detail.organization.id) activeSection = 'overview';
      current = detail;
      renderDetail();
      listView.hidden = true;
      detailView.hidden = false;
      $('detail-title').focus();
    } else {
      document.title = 'ISO partners | Greenwich Credit Partners internal dashboard (demo)';
      detailView.hidden = true;
      listView.hidden = false;
      await Promise.all([renderAnalytics(), renderList(), renderImports()]);
    }
  } catch (error) {
    if (location.hash !== hash) return;
    pageStatus.textContent = error.message;
    if (match) { detailView.hidden = true; listView.hidden = false; }
  }
}

async function init() {
  session = await api.loadAdminSession();
  $('admin-user').textContent = session.username;
  $('logout').addEventListener('click', () => api.logout().catch((error) => { pageStatus.textContent = error.message; }));

  $('f-stage').append(...options(ISO_STAGES));
  $('f-tier').append(...options([...ISO_TIERS.map((t) => ({ value: t, label: `Tier ${t}` })), { value: 'unscored', label: 'Not scored' }]));
  $('f-verification').append(...options(VERIFICATION_STATUSES));
  $('f-source').append(...options(ACQUISITION_SOURCES));
  $('f-reviewer').append(el('option', { value: session.username, text: `Assigned to me (${session.username})` }));

  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(() => renderList().catch((error) => { pageStatus.textContent = error.message; }), 150); };
  filters.addEventListener('input', refresh);
  filters.addEventListener('reset', () => setTimeout(refresh));
  filters.addEventListener('submit', (event) => { event.preventDefault(); refresh(); });

  $('import-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('import-status');
    const file = $('import-file').files[0];
    $('import-preview').replaceChildren();
    if (!file) { status.textContent = 'Choose a CSV file first.'; return; }
    if (file.size > 256 * 1024) { status.textContent = 'That file is larger than 256 KB.'; return; }
    status.textContent = 'Checking file…';
    try {
      pendingUpload = { filename: file.name, contentBase64: await fileToBase64(file) };
      await runPreview();
    } catch (error) {
      pendingUpload = null;
      status.textContent = error.message;
    }
  });

  window.addEventListener('hashchange', (event) => {
    if (location.hash.startsWith('#org=') || new URL(event.oldURL).hash.startsWith('#org=')) route();
  });
  await route();
}

init().catch((error) => { pageStatus.textContent = error.message; });
