// Internal dashboard: synthetic inquiries, their stages and campaign sources.
// Read-only in Phase 1. Every lead is run through the preliminary validation
// rules so the team can see what a reviewer would be asked to look at.

import { FIELDS, INDUSTRIES } from '../config/form-schema.js';
import { SOURCES, STAGES } from '../config/pipeline.js';
import { sourceBucket, sourceLabel } from '../lib/attribution.js';
import { REVIEW_REASONS, reviewReasonLabel } from '../config/review-reasons.js';
import { validationRules } from '../config/validation-rules.js';
import { el } from '../lib/dom.js';
import { demoLeadsToCSV } from '../lib/csv-export.js';
import { formatCurrency, formatDate, labelFor } from '../lib/format.js';
import { countBy, filterLeads } from '../lib/lead-stats.js';
import { buildScreeningInsights, buildWorkflowInsights } from '../lib/lead-insights.js';
import { OUTCOMES, OUTCOME_LABELS } from '../lib/validation-engine.js';
import { leadReferralPanel, referralPartnerLink } from './lead-referral-panel.js';
import { listLeads, loadAdminSession, logout, saveReview } from '../services/admin-service.js';
import { MAX_REVIEW_NOTE, allowedNextStages, requiresReviewReason } from '../lib/review-workflow.js';

let leads = [];
let adminSession = null;

const filters = document.getElementById('filters');
const rows = document.getElementById('lead-rows');
const resultCount = document.getElementById('result-count');
const empty = document.getElementById('empty');
const dialog = document.getElementById('lead-dialog');
const reviewStatus = document.getElementById('review-status');
let dialogLeadId = null;
let referralSort = '';
const referralFilter = document.getElementById('referred-by');
const sortButton = document.getElementById('referral-sort');
const mobileSortButton = document.getElementById('referral-sort-mobile');

function visibleLeads(criteria) {
  const filtered = filterLeads(leads, criteria).filter((lead) => !criteria.referredBy ||
    (lead.referral?.isoOrganizationId ?? 'direct') === criteria.referredBy);
  if (referralSort) filtered.sort((a, b) => {
    const label = (lead) => lead.referral?.isoDisplayName || 'Direct / unattributed';
    return label(a).localeCompare(label(b)) * (referralSort === 'ascending' ? 1 : -1);
  });
  return filtered;
}

function updateReferralFilter() {
  const selected = referralFilter.value;
  const partners = new Map(leads.filter((lead) => lead.referral)
    .map(({ referral }) => [referral.isoOrganizationId, referral.isoDisplayName]));
  referralFilter.replaceChildren(...[...referralFilter.options].slice(0, 2),
    ...[...partners].sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => el('option', { value, text: label })));
  referralFilter.value = partners.has(selected) || selected === 'direct' ? selected : '';
}

function toggleReferralSort() {
  referralSort = referralSort === 'ascending' ? 'descending' : 'ascending';
  sortButton.closest('th').setAttribute('aria-sort', referralSort);
  sortButton.querySelector('span').textContent = referralSort === 'ascending' ? '↑' : '↓';
  mobileSortButton.textContent = 'Referred by: ' + (referralSort === 'ascending' ? 'A to Z' : 'Z to A');
  renderRows();
}
sortButton.addEventListener('click', toggleReferralSort);
mobileSortButton.addEventListener('click', toggleReferralSort);

dialog.addEventListener('close', () => {
  const trigger = [...rows.querySelectorAll('.inquiry-name')].find((button) => button.dataset.leadId === dialogLeadId);
  (trigger ?? filters.querySelector('input')).focus();
  dialogLeadId = null;
  if (location.hash.startsWith('#lead=')) history.replaceState(history.state, '', location.pathname + location.search);
});

const tag = (kind, label) => el('span', { class: `tag tag-${kind}`, text: label });
const stageTag = (lead) => tag(lead.stage, labelFor(STAGES, lead.stage));
const validationTag = (lead) => tag(lead.validation.status, OUTCOME_LABELS[lead.validation.status]);
const row = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }));

// Summary ----------------------------------------------------------------------

function renderStats() {
  const byStage = countBy(leads, 'stage');
  const flagged = leads.filter((lead) => lead.validation.status !== OUTCOMES.READY_FOR_REVIEW).length;
  const stats = [
    ['Synthetic inquiries (current)', leads.length],
    ['New (current snapshot)', byStage.new ?? 0],
    ['Ready for handoff (current snapshot)', byStage.ready_for_handoff ?? 0],
    ['Flagged for follow-up', flagged],
  ];
  document.getElementById('stats').replaceChildren(
    ...stats.map(([label, value]) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }))),
  );
}

function renderBars(listId, options, key) {
  const counts = key === 'source'
    ? countBy(leads.map((lead) => ({source: sourceBucket(lead.source)})), 'source')
    : countBy(leads, key);
  const largest = Math.max(1, ...Object.values(counts));
  if (key === 'stage') {
    document.getElementById('stage-segments').replaceChildren(...options.flatMap(({ value }) => {
      if (!counts[value]) return [];
      const segment = el('span', { class: 'stage-' + value });
      segment.style.flexGrow = counts[value];
      return [segment];
    }));
  }
  document.getElementById(listId).replaceChildren(
    ...options.map(({ value, label }) => {
      const count = counts[value] ?? 0;
      const fill = el('span', { class: 'fill' });
      fill.style.setProperty('--share', `${(count / largest) * 100}%`);
      return el(
        'li',
        {},
        el('span', { text: label }),
        el('span', { class: 'count', text: count }),
        el('span', { class: 'track', 'aria-hidden': 'true' }, fill),
      );
    }),
  );
}

// Operational insights. These are counts on fictional sample data only. ----------

function renderInsights() {
  const screening = buildScreeningInsights(leads, validationRules);
  const activity = buildWorkflowInsights(leads);
  const metric = (label, value) => el('div', {}, el('dt', {text: label}), el('dd', {text: String(value)}));
  document.getElementById('screening-stats').replaceChildren(
    metric('Inquiries screened', screening.total),
    metric('Ready for human review', screening.byStatus[OUTCOMES.READY_FOR_REVIEW] ?? 0),
    metric('Needs missing information', screening.byStatus[OUTCOMES.NEEDS_INFO] ?? 0),
    metric('Manual clarification', screening.byStatus[OUTCOMES.MANUAL_REVIEW] ?? 0),
  );
  document.getElementById('reason-list').replaceChildren(
    ...(screening.reasons.length ? screening.reasons.map((reason) =>
      el('li', {}, el('span', {text: `${reason.label} (${reason.code})`}),
        el('span', {class: 'reason-count', text: String(reason.count)}))) :
      [el('li', {text: 'No review flags in this demo dataset.'})]),
  );
  document.getElementById('source-quality').replaceChildren(
    ...screening.sources.map((entry) =>
      el('tr', {},
        el('td', {text: labelFor(SOURCES, entry.source)}),
        el('td', {class: 'num', text: String(entry.inquiries)}),
        el('td', {class: 'num', text: String(entry.readyForReview)}),
        el('td', {class: 'num', text: String(entry.needsInfo + entry.manualReview)}))),
  );
  document.getElementById('workflow-stats').replaceChildren(
    metric('Inquiries in demo', activity.inquiries),
    metric('Reviewer-touched leads', activity.reviewed),
    metric('Recorded stage changes', activity.stageChanges),
    metric('Ever marked ready (logged actions)', activity.markedForHandoff),
    metric('Ever handed off (logged actions)', activity.simulatedHandoffs),
    metric('Currently ready (synthetic snapshot)', activity.currentReadyForHandoff),
    metric('Currently handed off (synthetic snapshot)', activity.currentHandedOff),
  );
}

// List -------------------------------------------------------------------------

function renderRows() {
  const criteria = Object.fromEntries(new FormData(filters));
  const visible = visibleLeads(criteria);
  document.getElementById('active-filters').replaceChildren(...Object.entries(criteria)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => {
      const control = filters.elements.namedItem(key);
      const label = control.labels[0].textContent;
      const display = control.selectedOptions?.[0]?.textContent ?? value;
      return el('button', { type: 'button', text: `${label}: ${display} ×`, 'aria-label': `Clear ${label} filter`, onclick: () => {
        control.value = '';
        renderRows();
        control.focus();
      } });
    }));

  rows.replaceChildren(
    ...visible.map((lead) =>
      el(
        'tr',
        { class: 'inquiry-row', role: 'row', onclick: (event) => {
          if (!event.target.closest('button, a, input, select, textarea')) openLead(lead);
        } },
        el('td', { role: 'cell', text: lead.id }),
        el('td', { role: 'cell', class: 'wrap business' }, el('button', {
          type: 'button', class: 'link-button inquiry-name', text: lead.businessName,
          'data-lead-id': lead.id, 'aria-label': `View ${lead.businessName}, ${lead.id}`,
          onclick: () => openLead(lead),
        })),
        el('td', { role: 'cell', class: 'wrap wide', text: labelFor(INDUSTRIES, lead.industry) }),
        el('td', { role: 'cell', text: lead.state }),
        el('td', { role: 'cell', class: 'num', text: answer(lead, 'amountRequested') }),
        el('td', { role: 'cell', class: 'num wide', text: answer(lead, 'monthlyRevenue') }),
        el('td', { role: 'cell',}, stageTag(lead)),
        el('td', { role: 'cell', class: 'wide' }, validationTag(lead)),
        el('td', { role: 'cell', class: 'screening-reasons wide', text: lead.validation.flags.map((flag) => flag.ruleId).join(', ') || '—' }),
        el('td', { role: 'cell', text: sourceLabel(lead.source) }),
        el('td', { role: 'cell', class: 'referral-cell' }, referralPartnerLink(lead.referral?.isoOrganizationId, lead.referral?.isoDisplayName)),
        el('td', { role: 'cell', class: 'wide', text: formatDate(lead.receivedAt) }),
        el('td', { role: 'cell',}, el('button', {
          type: 'button',
          class: 'link-button',
          text: 'View',
          'aria-label': `View ${lead.businessName}, ${lead.id}`,
          onclick: () => openLead(lead),
        })),
      ),
    ),
  );
  empty.hidden = visible.length > 0;
  resultCount.textContent = `Showing ${visible.length} of ${leads.length} inquiries`;
}

// Details ----------------------------------------------------------------------

function answer(lead, name) {
  const field = FIELDS[name];
  const value = lead[name];
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return 'Not provided';
  if (field.type === 'currency' || (field.acceptsLegacyCurrency && typeof value === 'number')) return formatCurrency(value);
  if (field.type === 'checkboxes') return value.map((v) => labelFor(field.options, v)).join(', ');
  if (field.options) return labelFor(field.options, value);
  return value;
}

function openLead(lead) {
  const { flags, rulesVersion } = lead.validation;
  const inquiryFields = [
    'industry', 'state', 'timeInBusiness', 'monthlyRevenue', 'amountRequested', 'useOfFunds',
    'useOfFundsDetail', 'hasExistingFinancing', 'existingFinancingTypes', 'existingFinancingBalance',
    ...['constructionPaymentTiming', 'existingFinancingPaymentFrequency', 'existingFinancingRemainingTerm']
      .filter((name) => lead[name] != null),
  ];

  const stageSelect = el('select', {id:'review-stage', name:'stage', required:true},
    STAGES.filter(({value}) => allowedNextStages(lead.stage).includes(value))
      .map(({value,label}) => el('option', {value, text:label, selected:lead.stage===value})));
  const noteInput = el('textarea', {id:'review-note', name:'note', rows:'3', maxlength: String(MAX_REVIEW_NOTE),
    placeholder:'Fictional follow-up note (optional)', 'aria-describedby':'review-caution'});
  const reasonSelect = el('select', {id:'review-reason', name:'reason', 'aria-describedby':'review-reason-hint'},
    el('option', {value:'', text:'Select an operational reason'}),
    REVIEW_REASONS.map(({value,label}) => el('option', {value, text:label, selected:lead.followUpReason===value})));
  const reasonField = el('div', {class:'review-reason-field'},
    el('label', {for:'review-reason',text:'Operational follow-up / closure reason'}),
    reasonSelect,
    el('p', {id:'review-reason-hint',class:'dialog-note',text:'For workflow tracking only; never a financing decline reason.'}));
  const syncReasonField = () => {
    const required = requiresReviewReason(stageSelect.value, lead);
    reasonField.hidden = !required;
    reasonSelect.required = required && stageSelect.value !== lead.stage;
    if (!required) reasonSelect.value = '';
  };
  stageSelect.addEventListener('change', () => {
    // A change into a reason-required stage needs a fresh operational reason.
    reasonSelect.value = stageSelect.value === lead.stage ? (lead.followUpReason || '') : '';
    syncReasonField();
  });
  syncReasonField();
  const formStatus = el('p', {class:'dialog-note', role:'status', 'aria-live':'polite'});
  const reviewForm = el('form', {
    class:'review-form',
    onsubmit: async (event) => {
      event.preventDefault();
      const submitButton = reviewForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      formStatus.textContent = 'Saving…';
      try {
        const updated = await saveReview(lead.id, {stage:stageSelect.value, note:noteInput.value, reason:reasonSelect.value});
        leads = leads.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
        renderStats();
        renderBars('stage-bars', STAGES, 'stage');
        renderRows();
        renderInsights();
        reviewStatus.textContent = `${updated.id} review saved to the server.`;
        dialog.close();
      } catch (error) {
        formStatus.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    }
  },
    el('label', {for:'review-stage', text:'Pipeline stage'}),
    stageSelect,
    reasonField,
    el('label', {for:'review-note', text:'Reviewer note (optional)'}),
    noteInput,
    el('p', {id:'review-caution',class:'dialog-note',text:'For synthetic demo records only. Do not enter real merchant information.'}),
    formStatus,
    el('button', {type:'submit',class:'button button-small',text:'Save demo review'})
  );

  const history = Array.isArray(lead.reviewHistory) ? [...lead.reviewHistory].reverse() : [];
  dialog.replaceChildren(
    el(
      'div',
      { class: 'dialog-head' },
      el('div', {},
        el('h2', { id: 'dialog-title', text: lead.businessName }),
        el('p', { text: `${lead.id}, received ${formatDate(lead.receivedAt)}. Synthetic demo data.` })),
      el('button', { type: 'button', class: 'button button-quiet button-small', text: 'Close ×', autofocus: true, onclick: () => dialog.close() }),
    ),

    el('h3', { text: 'Status' }),
    el('dl', { class: 'ledger' },
      el('div', {}, el('dt', { text: 'Stage' }), el('dd', {}, stageTag(lead))),
      row('Campaign source', sourceLabel(lead.source)),
      row('Medium', lead.medium || 'None recorded'),
      row('Campaign', lead.campaign || 'None recorded')),

    el('h3', { text: 'Review workflow (demo)' }),
    reviewForm,
    el('dl', {class:'ledger'}, row('Current operational reason', reviewReasonLabel(lead.followUpReason))),
    el('h3', { text: 'Review history' }),
    history.length ? el('ul', {class:'review-history'},history.map((entry) => el('li', {
      text:`${formatDate(entry.at)}: ${labelFor(STAGES, entry.stageBefore)} → ${labelFor(STAGES, entry.stageAfter)}${entry.note ? ' — ' + entry.note : ''}${entry.reason ? ' · ' + reviewReasonLabel(entry.reason) : ''}`
    }))) : el('p', {class:'dialog-note',text:'No reviewer actions recorded yet.'}),

    el('h3', { text: 'Preliminary validation' }),
    flags.length === 0
      ? el('p', {}, validationTag(lead), ' No rules raised a flag.')
      : el('ul', { class: 'flags' }, flags.map((flag) =>
          el('li', {}, tag(flag.outcome, OUTCOME_LABELS[flag.outcome]), el('span', { text: flag.message })))),
    el('p', {
      class: 'dialog-note',
      text: `Rules version ${rulesVersion}. Flags tell a reviewer what to look at. They are not a funding decision.`,
    }),

    el('h3', { text: 'Inquiry' }),
    el('dl', { class: 'ledger' },
      inquiryFields.map((name) => row(FIELDS[name].reviewLabel ?? FIELDS[name].label, answer(lead, name))),
      lead.state === 'CT' ? el('div', {}, el('dt', {text: 'State business registry'}), el('dd', {}, el('a', {
        href: 'https://service.ct.gov/business/s/onlinebusinesssearch?language=en_US',
        target: '_blank', rel: 'noopener noreferrer', text: 'Search Connecticut business records',
      }))) : null),

    leadReferralPanel(lead.id, (current) => {
      leads = leads.map((item) => item.id !== lead.id ? item : { ...item, referral: current && {
        isoOrganizationId: current.isoOrganizationId, isoDisplayName: current.isoDisplayName,
        method: current.method, attributedAt: current.firstAttributedAt,
      } });
      updateReferralFilter();
      renderRows();
    }),
    el('h3', { text: 'Contact (fictional)' }),
    el('dl', { class: 'ledger' },
      row('Name', lead.contactName), row('Email', lead.email), row('Phone', lead.phone)),
  );
  dialogLeadId = lead.id;
  dialog.showModal();
}

// Setup ------------------------------------------------------------------------

for (const [selectId, options] of [['stage', STAGES], ['source', SOURCES],
  ['screening', Object.entries(OUTCOME_LABELS).map(([value,label]) => ({value,label}))],
  ['reason', validationRules.rules.filter((r) => r.enabled).map((r) => ({value:r.id,label:r.reasonLabel || r.id}))]]) {
  document.getElementById(selectId).append(
    ...options.map(({ value, label }) => el('option', { value, text: label })),
  );
}

document.getElementById('export-csv').addEventListener('click', () => {
  const criteria = Object.fromEntries(new FormData(filters));
  const visible = visibleLeads(criteria);
  if (visible.length === 0) {
    resultCount.textContent = 'No demo leads match the filters; nothing to export.';
    return;
  }
  const csv = demoLeadsToCSV(visible);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'greenwich-credit-partners-demo-leads.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

filters.addEventListener('input', renderRows);
filters.addEventListener('submit', (event) => event.preventDefault());
filters.addEventListener('reset', () => setTimeout(renderRows)); // run after the fields have cleared

function openLinkedLead() {
  const id = new URLSearchParams(location.hash.slice(1)).get('lead');
  if (!id) return;
  const lead = leads.find((item) => item.id === id);
  if (lead && !dialog.open) openLead(lead);
  else if (!lead) resultCount.textContent = 'The linked inquiry could not be found.';
}

window.addEventListener('hashchange', openLinkedLead);

async function init() {
  try {
    adminSession = await loadAdminSession();
    const user = document.getElementById('admin-user');
    if (user) user.textContent = adminSession.username;
    leads = await listLeads();
    updateReferralFilter();
    renderStats();
    renderInsights();
    renderBars('stage-bars', STAGES, 'stage');
    renderBars('source-bars', SOURCES, 'source');
    renderRows();
    openLinkedLead();
  } catch (error) {
    resultCount.textContent = error.message;
  }
}

document.getElementById('logout')?.addEventListener('click', () => logout().catch((error) => {
  reviewStatus.textContent = error.message;
}));

await init();
