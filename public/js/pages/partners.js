// Public ISO / referral-partner demo application.
// The server validates everything again; checks here only give faster feedback.
import { US_STATES } from '../config/form-schema.js';
import { ISO_SPECIALIZATIONS, REFERRAL_VOLUME_BANDS, RELATIONSHIP_TYPES, YEARS_ACTIVE_BANDS } from '../config/iso-pipeline.js';
import { ISO_DEMO_IDENTITIES } from '../data/iso-demo-identities.js';
import { parseAttribution } from '../lib/attribution.js';
import { el } from '../lib/dom.js';
import { formatDate } from '../lib/format.js';
import { submitPartnerApplication } from '../services/partner-service.js';

const form = document.getElementById('partner-form');
const body = document.getElementById('form-body');
const summary = document.getElementById('error-summary');
const status = document.getElementById('status');
const submit = document.getElementById('submit');
const attribution = parseAttribution(new URLSearchParams(location.search));

let identityIndex = Math.floor(Math.random() * ISO_DEMO_IDENTITIES.length);
const identity = () => ISO_DEMO_IDENTITIES[identityIndex];

const FIELDS = [
  { name: 'relationshipType', type: 'radio', label: 'How does your organization work with small businesses?', options: RELATIONSHIP_TYPES.filter((o) => o.value !== 'unknown'), error: 'Choose how your organization works with small-business borrowers.' },
  { name: 'region', type: 'select', label: 'Main state of operation', options: US_STATES, error: 'Choose the state you mainly operate in.' },
  { name: 'specializations', type: 'checkboxes', label: 'Product focus', hint: 'Choose every product you regularly refer.', options: ISO_SPECIALIZATIONS, error: 'Choose at least one product focus.' },
  { name: 'referralVolume', type: 'select', label: 'Typical monthly referrals', options: REFERRAL_VOLUME_BANDS, error: 'Choose a monthly referral range.' },
  { name: 'yearsActive', type: 'select', label: 'Time active as an organization', options: YEARS_ACTIVE_BANDS, error: 'Choose how long the organization has been active.' },
  { name: 'demoAcknowledged', type: 'checkbox', label: 'I understand this is a demonstration that uses a fictional organization, and that no partnership or referral agreement is created.', error: 'Confirm that this is a demonstration using fictional details.' },
];

function renderIdentity() {
  const current = identity();
  const rows = [['Organization', current.organizationName], ['Website', current.website], ['Contact', `${current.contactName}, ${current.contactRole}`], ['Email', current.email], ['Phone', current.phone]];
  return el('div', { class: 'identity', id: 'identity' },
    el('p', { class: 'marker', text: 'Demo mode: this application uses a fictional organization. You cannot type real organization or contact details here.' }),
    el('dl', { class: 'ledger' }, rows.map(([label, value]) => el('div', {}, el('dt', { text: label }), el('dd', { text: value })))),
    el('button', { type: 'button', class: 'link-button', text: 'Use a different fictional organization', onclick: () => {
      identityIndex = (identityIndex + 1) % ISO_DEMO_IDENTITIES.length;
      document.getElementById('identity').replaceWith(renderIdentity());
    } }),
  );
}

function renderField(field) {
  const errorId = `${field.name}-error`;
  const hintId = field.hint && `${field.name}-hint`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  const hint = field.hint && el('p', { class: 'hint', id: hintId, text: field.hint });
  let content;
  if (field.type === 'select') {
    content = [el('label', { for: field.name, text: field.label }), hint,
      el('select', { id: field.name, name: field.name, 'aria-describedby': describedBy },
        el('option', { value: '', text: 'Select an option' }), field.options.map((o) => el('option', { value: o.value, text: o.label })))];
  } else if (field.type === 'checkbox') {
    content = el('label', { class: 'choice' }, el('input', { type: 'checkbox', id: field.name, name: field.name, 'aria-describedby': describedBy }), el('span', { text: field.label }));
  } else {
    content = el('fieldset', { 'aria-describedby': describedBy }, el('legend', { text: field.label }), hint,
      el('div', { class: field.type === 'checkboxes' ? 'choice-grid' : '' }, field.options.map((o, index) => el('label', { class: 'choice' },
        el('input', { type: field.type === 'radio' ? 'radio' : 'checkbox', name: field.name, value: o.value, id: index === 0 ? field.name : null }), el('span', { text: o.label })))));
  }
  return el('div', { class: 'field', id: `field-${field.name}` }, content, el('p', { class: 'field-error', id: errorId }));
}

function readAnswers() {
  const data = new FormData(form);
  return {
    relationshipType: data.get('relationshipType') ?? '',
    region: data.get('region') ?? '',
    specializations: data.getAll('specializations'),
    referralVolume: data.get('referralVolume') ?? '',
    yearsActive: data.get('yearsActive') ?? '',
    demoAcknowledged: data.get('demoAcknowledged') === 'on',
  };
}

function validate(answers) {
  const errors = {};
  for (const field of FIELDS) {
    const value = answers[field.name];
    const missing = Array.isArray(value) ? value.length === 0 : value === '' || value === false;
    if (missing) errors[field.name] = field.error;
  }
  return errors;
}

function showErrors(errors, message = '') {
  for (const field of FIELDS) {
    const wrapper = document.getElementById(`field-${field.name}`);
    wrapper.classList.toggle('has-error', Boolean(errors[field.name]));
    document.getElementById(`${field.name}-error`).textContent = errors[field.name] ?? '';
  }
  const names = Object.keys(errors);
  if (names.length === 0 && !message) { summary.hidden = true; summary.replaceChildren(); return; }
  summary.replaceChildren(
    el('h2', { text: message || 'Check these answers before submitting' }),
    names.length > 0 && el('ul', {}, names.map((name) => el('li', {}, el('a', { href: `#${name}`, text: errors[name] })))),
  );
  summary.hidden = false;
  summary.focus();
}

function showConfirmation(receipt) {
  const confirmation = el('section', { class: 'sheet confirmation', 'aria-labelledby': 'confirm-title' },
    el('p', { class: 'partner-eyebrow', text: 'Demo application received' }),
    el('h1', { id: 'confirm-title', tabindex: '-1', text: 'Your partner application is in the review queue' }),
    el('p', { text: 'Keep this reference. It identifies the fictional application in the internal partner workspace.' }),
    el('p', { class: 'reference', id: 'reference', text: receipt.reference }),
    el('dl', { class: 'ledger' },
      el('div', {}, el('dt', { text: 'Organization (fictional)' }), el('dd', { text: receipt.organizationName })),
      el('div', {}, el('dt', { text: 'Received' }), el('dd', { text: formatDate(receipt.receivedAt) })),
      el('div', {}, el('dt', { text: 'Status' }), el('dd', { text: 'Received for manual review' }))),
    el('h2', { text: 'What happens next in the demo' }),
    el('ol', { class: 'next-steps' },
      el('li', { text: 'A reviewer checks the organization against documented evidence.' }),
      el('li', { text: 'Verification and any next step are decided by a person, not by this form.' }),
      el('li', { text: 'No email, call or message is sent. Outreach is not enabled in this prototype.' })),
    el('p', { class: 'fine', text: 'This was a simulation with a fictional organization. No partnership, referral agreement or funding decision was created.' }),
    el('div', { class: 'actions' },
      el('a', { class: 'button', href: `partners.html${location.search}`, text: 'Submit another demo application' }),
      el('a', { href: 'index.html', text: 'Back to home' })),
  );
  form.replaceWith(confirmation);
  status.textContent = '';
  confirmation.querySelector('h1').focus();
}

body.replaceChildren(renderIdentity(), ...FIELDS.map(renderField));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const answers = readAnswers();
  const errors = validate(answers);
  showErrors(errors);
  if (Object.keys(errors).length > 0) return;
  submit.disabled = true;
  status.textContent = 'Submitting demo application…';
  try {
    showConfirmation(await submitPartnerApplication(answers, { identity: identity(), ...attribution }));
  } catch (error) {
    status.textContent = '';
    showErrors(error.fieldErrors ?? {}, error.fieldErrors ? '' : error.message);
    submit.disabled = false;
  }
});
form.hidden = false;
