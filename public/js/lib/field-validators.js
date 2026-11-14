// Front-end checks for the inquiry form: is each answer present and well-formed?
// These only catch typos and blanks. They say nothing about eligibility.

import { FIELDS, STEPS } from '../config/form-schema.js';

// Guards against stray extra digits. Not a funding limit.
const MAX_DOLLARS = 100_000_000;

export function parseCurrency(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const cleaned = String(input ?? '').replace(/[$,\s]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : null;
}

export function isVisible(name, values) {
  const { showIf } = FIELDS[name];
  return !showIf || showIf(values);
}

const isBlank = (value) =>
  value == null || value === false || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '');

// Returns an error message, or null when the answer is acceptable.
export function validateField(name, values) {
  const field = FIELDS[name];
  if (!isVisible(name, values)) return null;

  const value = values[name];
  if (isBlank(value)) return field.required ?? null;

  if (field.type === 'currency' || (field.acceptsLegacyCurrency && parseCurrency(value) !== null)) {
    const amount = parseCurrency(value);
    if (amount === null) return 'Enter a dollar amount using numbers only, for example 25,000.';
    if (amount <= 0) return 'Enter an amount greater than zero.';
    if (amount > MAX_DOLLARS) return 'That amount looks too large. Check for extra digits.';
    return null;
  }
  if ((field.type === 'select' || field.type === 'radio') && !field.options.some((o) => o.value === value)) {
    return field.required ?? 'Select one of the listed options.';
  }
  if (field.type === 'textarea' && String(value).length > field.maxLength) {
    return `Shorten this to ${field.maxLength} characters or fewer.`;
  }
  return null;
}

// Returns { fieldName: message } for every field in the step that has a problem.
export function validateStep(stepId, values) {
  const step = STEPS.find((s) => s.id === stepId);
  const errors = {};
  for (const name of step.fields) {
    const message = validateField(name, values);
    if (message) errors[name] = message;
  }
  return errors;
}

// Converts raw form values into the shape stored on a lead: hidden fields
// dropped, dollar amounts as numbers, text trimmed.
export function normalizeAnswers(values) {
  const answers = {};
  for (const [name, field] of Object.entries(FIELDS)) {
    if (!isVisible(name, values) || isBlank(values[name])) continue;
    if (field.type === 'currency' || (field.acceptsLegacyCurrency && parseCurrency(values[name]) !== null)) answers[name] = parseCurrency(values[name]);
    else if (field.type === 'textarea') answers[name] = String(values[name]).trim();
    else answers[name] = values[name];
  }
  return answers;
}
