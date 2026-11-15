import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAnswers, parseCurrency, validateField, validateStep } from '../public/js/lib/field-validators.js';
import { FIELDS, STEPS } from '../public/js/config/form-schema.js';

test('parseCurrency accepts common ways of typing an amount', () => {
  assert.equal(parseCurrency('25000'), 25000);
  assert.equal(parseCurrency('$25,000'), 25000);
  assert.equal(parseCurrency(' 1,250.50 '), 1250.5);
});

test('parseCurrency rejects text that is not an amount', () => {
  for (const input of ['', 'abc', '25k', '-500', '1.2.3', null]) {
    assert.equal(parseCurrency(input), null);
  }
});

test('required fields report their own message when blank', () => {
  assert.equal(validateField('industry', {}), FIELDS.industry.required);
  assert.equal(validateField('demoAcknowledged', { demoAcknowledged: false }), FIELDS.demoAcknowledged.required);
});

test('optional fields may be left blank', () => {
  assert.equal(validateField('useOfFundsDetail', { useOfFundsDetail: '  ' }), null);
});

test('amounts must be positive numbers', () => {
  assert.match(validateField('amountRequested', { amountRequested: 'lots' }), /select/i);
  assert.match(validateField('amountRequested', { amountRequested: '0' }), /greater than zero/);
  assert.equal(validateField('amountRequested', { amountRequested: '$40,000' }), null);
});

test('a value that is not one of the options is rejected', () => {
  assert.equal(validateField('state', { state: 'ZZ' }), FIELDS.state.required);
});

test('conditional fields are only checked when shown', () => {
  const hidden = { hasExistingFinancing: 'no', existingFinancingBalance: 'not a number' };
  assert.equal(validateField('existingFinancingBalance', hidden), null);
  const shown = { hasExistingFinancing: 'yes', existingFinancingBalance: 'not a number' };
  assert.match(validateField('existingFinancingBalance', shown), /select/i);
});

test('validateStep returns one message per problem field', () => {
  const errors = validateStep('business', { industry: 'retail' });
  assert.deepEqual(Object.keys(errors), ['state', 'timeInBusiness']);
  assert.deepEqual(validateStep('business', { industry: 'retail', state: 'CT', timeInBusiness: '1_2y' }), {});
});

test('normalizeAnswers parses amounts, trims text and drops hidden fields', () => {
  const answers = normalizeAnswers({
    monthlyRevenue: '$40,000',
    useOfFundsDetail: '  new oven ',
    hasExistingFinancing: 'no',
    existingFinancingTypes: ['mca'],
  });
  assert.deepEqual(answers, { monthlyRevenue: 40000, useOfFundsDetail: 'new oven', hasExistingFinancing: 'no' });
});

test('every field named in a step exists in the schema', () => {
  for (const step of STEPS) {
    for (const name of step.fields) assert.ok(FIELDS[name], `${step.id} references unknown field ${name}`);
  }
});
