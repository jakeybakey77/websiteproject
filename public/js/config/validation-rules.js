// Preliminary validation rules. Edit this file to change what gets flagged; the
// engine that runs these rules is lib/validation-engine.js.
//
// What these rules are: completeness and follow-up checks that help a person on
// the team decide what to look at next.
// What they are not: eligibility criteria. Nothing here approves, declines or
// scores an applicant, and the engine rejects any outcome other than the three below.
//
// TODO(legal): have counsel review every enabled rule (including for fair-lending
// impact) before these run against real inquiries.
// TODO(integrations): any funder-specific criteria must come from that funder's
// written requirements. Do not guess them.

import { OUTCOMES } from '../lib/validation-engine.js';

export const validationRules = {
  version: '0.1.0-demo',
  rules: [
    {
      id: 'core-answers-present',
      category: 'completeness', reasonLabel: 'Missing core answers',
      type: 'requiredFields',
      enabled: true,
      outcome: OUTCOMES.NEEDS_INFO,
      message: 'One or more core answers are missing.',
      params: {
        fields: [
          'industry', 'state', 'timeInBusiness', 'monthlyRevenue',
          'amountRequested', 'useOfFunds', 'hasExistingFinancing',
        ],
      },
    },
    {
      id: 'existing-financing-types-missing',
      category: 'financing-details', reasonLabel: 'Existing financing type not specified',
      type: 'followUpWhen',
      enabled: true,
      outcome: OUTCOMES.NEEDS_INFO,
      message: 'Has existing financing but did not say what kind. Ask in follow-up.',
      params: { field: 'hasExistingFinancing', equals: 'yes', unlessPresent: 'existingFinancingTypes' },
    },
    {
      id: 'existing-financing-unsure',
      category: 'financing-details', reasonLabel: 'Existing financing uncertain',
      type: 'followUpWhen',
      enabled: true,
      outcome: OUTCOMES.MANUAL_REVIEW,
      message: 'Not sure whether the business has existing financing. Confirm in follow-up.',
      params: { field: 'hasExistingFinancing', equals: 'unsure' },
    },
    {
      id: 'use-of-funds-unspecified',
      category: 'funding-purpose', reasonLabel: 'Funding purpose detail missing',
      type: 'followUpWhen',
      enabled: true,
      outcome: OUTCOMES.NEEDS_INFO,
      message: 'Use of funds is "something else" with no details. Ask in follow-up.',
      params: { field: 'useOfFunds', equals: 'other', unlessPresent: 'useOfFundsDetail' },
    },

    // Disabled until the values are supplied by the business, not invented here.
    {
      id: 'service-area',
      category: 'unconfigured', reasonLabel: 'State outside authorized operating area',
      type: 'allowedValues',
      enabled: false,
      outcome: OUTCOMES.MANUAL_REVIEW,
      message: 'Business is in a state outside the configured service area.',
      params: { field: 'state', values: [] }, // e.g. ['CT', 'NY'] once confirmed by counsel
    },
    {
      id: 'amount-to-revenue',
      category: 'unconfigured', reasonLabel: 'Requested amount needs manual clarification',
      type: 'ratioAbove',
      enabled: false,
      outcome: OUTCOMES.MANUAL_REVIEW,
      message: 'Requested amount is high relative to monthly revenue. Review by hand.',
      params: { numerator: 'amountRequested', denominator: 'monthlyRevenue', threshold: null },
    },
  ],
};
