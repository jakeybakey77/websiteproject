import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OUTCOMES, evaluateLead, validateRules } from '../public/js/lib/validation-engine.js';
import { validationRules } from '../public/js/config/validation-rules.js';
import { sampleLeads } from '../public/js/data/sample-leads.js';

const completeLead = {
  industry: 'retail',
  state: 'CT',
  timeInBusiness: '2_5y',
  monthlyRevenue: 50000,
  amountRequested: 25000,
  useOfFunds: 'inventory',
  hasExistingFinancing: 'no',
};

test('a complete inquiry is ready for review with no flags', () => {
  const result = evaluateLead(completeLead, validationRules);
  assert.equal(result.status, OUTCOMES.READY_FOR_REVIEW);
  assert.deepEqual(result.flags, []);
  assert.equal(result.rulesVersion, validationRules.version);
});

test('a missing core answer needs info and names the field', () => {
  const result = evaluateLead({ ...completeLead, state: '' }, validationRules);
  assert.equal(result.status, OUTCOMES.NEEDS_INFO);
  assert.match(result.flags[0].message, /Missing: state/);
});

test('"not sure" about existing financing goes to manual review', () => {
  const result = evaluateLead({ ...completeLead, hasExistingFinancing: 'unsure' }, validationRules);
  assert.equal(result.status, OUTCOMES.MANUAL_REVIEW);
});

test('existing financing with types listed raises no flag', () => {
  const lead = { ...completeLead, hasExistingFinancing: 'yes', existingFinancingTypes: ['term_loan'] };
  assert.equal(evaluateLead(lead, validationRules).status, OUTCOMES.READY_FOR_REVIEW);
});

test('needs info takes precedence over manual review', () => {
  const lead = { ...completeLead, hasExistingFinancing: 'unsure', useOfFunds: 'other' };
  const result = evaluateLead(lead, validationRules);
  assert.equal(result.flags.length, 2);
  assert.equal(result.status, OUTCOMES.NEEDS_INFO);
});

test('disabled rules do not run', () => {
  const lead = { ...completeLead, amountRequested: 5_000_000 };
  assert.equal(evaluateLead(lead, validationRules).status, OUTCOMES.READY_FOR_REVIEW);
});

test('threshold and service-area rules work once configured', () => {
  const config = {
    version: 'test',
    rules: [
      {
        id: 'ratio', type: 'ratioAbove', enabled: true, outcome: OUTCOMES.MANUAL_REVIEW, message: 'High ratio.',
        params: { numerator: 'amountRequested', denominator: 'monthlyRevenue', threshold: 2 },
      },
      {
        id: 'area', type: 'allowedValues', enabled: true, outcome: OUTCOMES.MANUAL_REVIEW, message: 'Outside area.',
        params: { field: 'state', values: ['NY'] },
      },
    ],
  };
  const flagged = evaluateLead({ ...completeLead, amountRequested: 150000 }, config);
  assert.deepEqual(flagged.flags.map((f) => f.ruleId), ['ratio', 'area']);
  assert.deepEqual(evaluateLead({ ...completeLead, state: 'NY' }, config).flags, []);
});

test('a rule cannot be configured to approve or decline', () => {
  for (const outcome of ['approved', 'declined', 'rejected', OUTCOMES.READY_FOR_REVIEW]) {
    const config = {
      version: 'test',
      rules: [{ id: 'bad', type: 'requiredFields', enabled: true, outcome, message: '', params: { fields: [] } }],
    };
    assert.throws(() => evaluateLead(completeLead, config), /not allowed/);
  }
});

test('a threshold rule cannot be enabled without a threshold', () => {
  const config = structuredClone(validationRules);
  config.rules.find((rule) => rule.id === 'amount-to-revenue').enabled = true;
  assert.throws(() => validateRules(config), /numeric threshold/);
});

test('the shipped rules are valid and every sample lead gets an allowed status', () => {
  validateRules(validationRules);
  const allowed = Object.values(OUTCOMES);
  for (const lead of sampleLeads()) {
    assert.ok(allowed.includes(evaluateLead(lead, validationRules).status));
  }
});
