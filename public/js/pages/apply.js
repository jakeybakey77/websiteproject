// Inquiry form. Renders each step from config/form-schema.js, checks answers
// with lib/field-validators.js, shows a review screen, then simulates sending.

import { FIELDS, STEPS } from '../config/form-schema.js';
import { parseAttribution } from '../lib/attribution.js';
import { DEMO_IDENTITIES } from '../data/demo-identities.js';
import { el } from '../lib/dom.js';
import { isVisible, normalizeAnswers, validateStep } from '../lib/field-validators.js';
import { formatCurrency, labelFor } from '../lib/format.js';
import { submitInquiry } from '../services/lead-service.js';

const REVIEW = STEPS.length; // the review screen comes after the last step
const STEP_NAMES = [...STEPS.map((step) => step.title), 'Review'];

const form = document.getElementById('inquiry-form');
const progress = document.getElementById('progress');
const summary = document.getElementById('error-summary');
const title = document.getElementById('step-title');
const intro = document.getElementById('step-intro');
const body = document.getElementById('step-body');
const backButton = document.getElementById('back');
const nextButton = document.getElementById('next');
const status = document.getElementById('status');

// Raw answers live in memory only. Reloading the page clears them.
const state = { index: 0, values: {}, identityIndex: 0, reachedReview: false };

// Where the visitor came from, e.g. apply.html?utm_source=google_search&utm_campaign=spring
const params = new URLSearchParams(location.search);
const attribution = parseAttribution(params);

const identity = () => DEMO_IDENTITIES[state.identityIndex];
const row = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: value }));

// Rendering ------------------------------------------------------------------

function renderProgress() {
  progress.replaceChildren(
    el('p', { text: `Step ${state.index + 1} of ${STEP_NAMES.length}: ${STEP_NAMES[state.index]}` }),
    el(
      'ol',
      {},
      STEP_NAMES.map((name, index) =>
        el(
          'li',
          {
            class: index < state.index ? 'is-done' : index === state.index ? 'is-current' : '',
            'aria-current': index === state.index && 'step',
          },
          el('span', { class: 'step-number', 'aria-hidden': 'true', text: index < state.index ? '✓' : String(index + 1) }),
          el('span', { text: name }),
        ),
      ),
    ),
  );
}

function renderField(name) {
  const field = FIELDS[name];
  const value = state.values[name];
  const errorId = `${name}-error`;
  const hintId = field.hint && `${name}-hint`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  const hint = field.hint && el('p', { class: 'hint', id: hintId, text: field.hint });
  let content;

  if (field.type === 'select') {
    content = [
      el('label', { for: name, text: field.label }),
      hint,
      el(
        'select',
        { id: name, name, 'aria-describedby': describedBy },
        el('option', { value: '', text: 'Select an option' }),
        field.options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value })),
      ),
    ];
  } else if (field.type === 'currency') {
    content = [
      el('label', { for: name, text: field.label }),
      hint,
      el(
        'div',
        { class: 'money' },
        el('span', { 'aria-hidden': 'true', text: '$' }),
        el('input', {
          id: name, name, type: 'text', inputmode: 'decimal', autocomplete: 'off',
          value: value ?? '', 'aria-describedby': describedBy,
        }),
      ),
    ];
  } else if (field.type === 'textarea') {
    const counter = el('p', { class: 'character-count', text: `${(value ?? '').length} / ${field.maxLength}` });
    content = [
      el('label', { for: name, text: field.label }),
      el('textarea', {
        id: name, name, rows: 3, maxlength: field.maxLength, 'aria-describedby': describedBy, text: value ?? '',
        oninput: ({ target }) => { counter.textContent = `${target.value.length} / ${field.maxLength}`; },
      }),
      counter,
    ];
  } else if (field.type === 'checkbox') {
    content = el(
      'label',
      { class: 'choice' },
      el('input', { type: 'checkbox', id: name, name, checked: value === true, 'aria-describedby': describedBy }),
      el('span', { text: field.label }),
    );
  } else {
    // radio or checkboxes: a group of options under one legend
    const chosen = [].concat(value ?? []);
    content = el(
      'fieldset',
      { 'aria-describedby': describedBy },
      el('legend', { text: field.label }),
      hint,
      field.options.map((o) =>
        el(
          'label',
          { class: 'choice' },
          el('input', {
            type: field.type === 'radio' ? 'radio' : 'checkbox',
            name, value: o.value, checked: chosen.includes(o.value),
          }),
          el('span', { text: o.label }),
        ),
      ),
    );
  }

  return el(
    'div',
    { class: 'field', id: `field-${name}`, 'data-field': name, hidden: !isVisible(name, state.values) },
    content,
    el('p', { class: 'field-error', id: errorId }),
  );
}

// Demo mode never asks for real contact details. It shows a fictional identity instead.
function renderIdentity() {
  const { contactName, businessName, email, phone } = identity();
  return el(
    'div',
    { class: 'identity' },
    el('p', {
      class: 'marker',
      text: 'Fictional contact. Demo mode does not accept real names, emails or phone numbers.',
    }),
    el('dl', { class: 'ledger' },
      row('Name', contactName), row('Business', businessName), row('Email', email), row('Phone', phone)),
    el('button', {
      type: 'button',
      class: 'button button-quiet button-small',
      text: 'Use a different fictional contact',
      onclick: (event) => {
        state.identityIndex = (state.identityIndex + 1) % DEMO_IDENTITIES.length;
        const next = renderIdentity();
        event.target.closest('.identity').replaceWith(next);
        next.querySelector('button').focus();
        status.textContent = `Fictional contact changed to ${identity().contactName}, ${identity().businessName}.`;
      },
    }),
  );
}

function displayValue(name, value) {
  const field = FIELDS[name];
  if (field.type === 'currency') return formatCurrency(value);
  if (field.type === 'checkboxes') return value.map((v) => labelFor(field.options, v)).join(', ');
  if (field.type === 'checkbox') return 'Confirmed';
  if (field.options) return labelFor(field.options, value);
  return value;
}

function renderReview() {
  const answers = normalizeAnswers(state.values);
  const { contactName, businessName, email, phone } = identity();
  return STEPS.map((step, index) =>
    el(
      'section',
      { class: 'review-section' },
      el(
        'div',
        { class: 'review-head' },
        el('h2', { text: step.title }),
        el('button', {
          type: 'button',
          class: 'link-button',
          text: 'Change',
          'aria-label': `Change ${step.title.toLowerCase()}`,
          onclick: () => goTo(index),
        }),
      ),
      el(
        'dl',
        { class: 'ledger' },
        step.id === 'contact' && [
          row('Name (fictional)', contactName), row('Business (fictional)', businessName),
          row('Email (fictional)', email), row('Phone (fictional)', phone),
        ],
        step.fields
          .filter((name) => name in answers)
          .map((name) => row(FIELDS[name].reviewLabel ?? FIELDS[name].label, displayValue(name, answers[name]))),
      ),
    ),
  );
}

function render({ moveFocus = true } = {}) {
  const onReview = state.index === REVIEW;
  const step = STEPS[state.index];
  if (onReview) state.reachedReview = true;

  renderProgress();
  showErrors({});
  status.textContent = '';
  title.textContent = onReview ? 'Review your answers' : step.title;
  intro.textContent = onReview
    ? 'Check each section. Use Change to fix anything, then submit.'
    : step.intro;
  body.replaceChildren(
    ...(onReview ? renderReview() : [step.id === 'contact' && renderIdentity(), ...step.fields.map(renderField)].filter(Boolean)),
  );
  backButton.hidden = state.index === 0;
  nextButton.textContent = onReview
    ? 'Submit demo inquiry'
    : state.reachedReview || state.index === REVIEW - 1 ? 'Review answers' : 'Continue';
  document.title = `${title.textContent} (step ${state.index + 1} of ${STEP_NAMES.length}) | Greenwich Credit Partners demo`;
  if (moveFocus) title.focus();
}

// Reading and checking answers -------------------------------------------------

function readStep(step) {
  const data = new FormData(form);
  for (const name of step.fields) {
    const { type } = FIELDS[name];
    if (type === 'checkboxes') state.values[name] = data.getAll(name);
    else if (type === 'checkbox') state.values[name] = data.has(name);
    else state.values[name] = data.get(name) ?? '';
  }
}

function focusField(name) {
  document.getElementById(`field-${name}`).querySelector('select, textarea, input').focus();
}

// errors: { fieldName: message }. Pass {} to clear.
function showErrors(errors) {
  for (const wrapper of body.querySelectorAll('[data-field]')) {
    const message = errors[wrapper.dataset.field] ?? '';
    wrapper.classList.toggle('has-error', message !== '');
    wrapper.querySelector('.field-error').textContent = message;
    for (const control of wrapper.querySelectorAll('select, textarea, input:not([type="radio"])')) {
      control.setAttribute('aria-invalid', String(message !== ''));
    }
  }

  const entries = Object.entries(errors);
  summary.hidden = entries.length === 0;
  summary.replaceChildren();
  if (entries.length === 0) return;
  summary.append(
    el('h2', { text: entries.length === 1 ? 'Fix 1 answer to continue' : `Fix ${entries.length} answers to continue` }),
    el('ul', {}, entries.map(([name, message]) =>
      el('li', {}, el('a', {
        href: `#field-${name}`,
        text: message,
        onclick: (event) => {
          event.preventDefault();
          focusField(name);
        },
      })),
    )),
  );
  summary.focus();
}

// Moving between steps ---------------------------------------------------------

function goTo(index) {
  state.index = index;
  render();
}

// Show or hide conditional fields as answers change.
body.addEventListener('change', () => {
  const step = STEPS[state.index];
  if (!step) return;
  readStep(step);
  for (const name of step.fields) {
    document.getElementById(`field-${name}`).hidden = !isVisible(name, state.values);
  }
});

backButton.addEventListener('click', () => {
  if (state.index < REVIEW) readStep(STEPS[state.index]);
  goTo(state.index - 1);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.index === REVIEW) {
    await send();
    return;
  }
  const step = STEPS[state.index];
  readStep(step);
  const errors = validateStep(step.id, state.values);
  if (Object.keys(errors).length > 0) showErrors(errors);
  else goTo(state.reachedReview ? REVIEW : state.index + 1);
});

// Simulated submission -----------------------------------------------------------

async function send() {
  nextButton.disabled = backButton.disabled = true;
  status.textContent = 'Submitting demo inquiry…';
  try {
    const lead = await submitInquiry(normalizeAnswers(state.values), { identity: identity(), ...attribution });
    showConfirmation(lead);
  } catch {
    nextButton.disabled = backButton.disabled = false;
    status.textContent = 'The demo inquiry was not submitted. Reload the page and try again.';
  }
}

function showConfirmation(lead) {
  const confirmation = el(
    'section',
    { class: 'sheet confirmation' },
    el('h1', { tabindex: -1, text: 'Demo inquiry submitted' }),
    el('p', {}, 'Reference: ', el('strong', { text: lead.id })),
    el('p', {
      class: 'marker',
      text: 'This was a simulation using fictional contact details. No funding request was sent to a lender and no one will contact you.',
    }),
    el('p', {
      text:
        'The fictional inquiry was stored on this demo server so an authenticated reviewer can test the workflow. ' +
        'It is not a real application and is not shared with a funding provider.',
    }),
    el(
      'p',
      { class: 'actions' },
      el('a', { class: 'button', href: 'admin/', text: 'See it in the internal dashboard' }),
      el('a', { href: 'index.html', text: 'Back to home' }),
    ),
  );
  progress.hidden = true;
  status.textContent = '';
  form.replaceWith(confirmation);
  document.title = 'Demo inquiry submitted | Greenwich Credit Partners demo';
  confirmation.querySelector('h1').focus();
}

render({ moveFocus: false });
form.hidden = false;
