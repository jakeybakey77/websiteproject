// Server-side validation for the public ISO / referral-partner demo application.
// This is a separate intake from the merchant inquiry: different endpoint, different
// schema, different tables. In demo mode the identity must be one of the built-in
// fictional partner organizations; arbitrary names, emails or phones are rejected.
import { US_STATES } from '../public/js/config/form-schema.js';
import { ISO_SPECIALIZATIONS, REFERRAL_VOLUME_BANDS, RELATIONSHIP_TYPES, YEARS_ACTIVE_BANDS, values } from '../public/js/config/iso-pipeline.js';
import { ISO_DEMO_IDENTITIES } from '../public/js/data/iso-demo-identities.js';
import { normalizeSource, sanitizeAttribution } from '../public/js/lib/attribution.js';

const IDENTITY_KEYS = ['organizationName', 'website', 'contactName', 'contactRole', 'email', 'phone'];
const APPLICANT_RELATIONSHIPS = values(RELATIONSHIP_TYPES).filter((value) => value !== 'unknown');

function matchDemoIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return null;
  return ISO_DEMO_IDENTITIES.find((candidate) => IDENTITY_KEYS.every((key) => candidate[key] === identity[key])) ?? null;
}

export function validateIsoApplication(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('Invalid partner application payload.'), { statusCode: 400 });
  }
  const answers = payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers) ? payload.answers : {};
  const errors = {};
  const pick = (name, options, message) => {
    if (typeof answers[name] !== 'string' || !options.includes(answers[name])) errors[name] = message;
  };
  pick('relationshipType', APPLICANT_RELATIONSHIPS, 'Choose how your organization works with small-business borrowers.');
  pick('region', values(US_STATES), 'Choose the state you mainly operate in.');
  pick('referralVolume', values(REFERRAL_VOLUME_BANDS), 'Choose a monthly referral range.');
  pick('yearsActive', values(YEARS_ACTIVE_BANDS), 'Choose how long the organization has been active.');
  const allowed = values(ISO_SPECIALIZATIONS);
  const specializations = Array.isArray(answers.specializations) ? [...new Set(answers.specializations)] : null;
  if (!specializations || specializations.length === 0) errors.specializations = 'Choose at least one product focus.';
  else if (specializations.length > allowed.length || !specializations.every((s) => typeof s === 'string' && allowed.includes(s))) errors.specializations = 'Choose product focus areas from the list.';
  if (answers.demoAcknowledged !== true) errors.demoAcknowledged = 'Confirm that this is a demonstration using fictional details.';
  if (Object.keys(errors).length > 0) {
    throw Object.assign(new Error('Partner application validation failed.'), { statusCode: 422, fieldErrors: errors });
  }

  const identity = matchDemoIdentity(payload.identity);
  if (!identity) {
    throw Object.assign(new Error('Demo partner applications must use one of the built-in fictional organizations. Real organization or contact details are not accepted.'), { statusCode: 422 });
  }

  return {
    identity: { ...identity },
    answers: {
      relationshipType: answers.relationshipType,
      region: answers.region,
      specializations: allowed.filter((s) => specializations.includes(s)),
      referralVolume: answers.referralVolume,
      yearsActive: answers.yearsActive,
    },
    attribution: {
      source: normalizeSource(payload.source),
      medium: sanitizeAttribution(payload.medium, 60).toLowerCase(),
      campaign: sanitizeAttribution(payload.campaign, 80),
    },
  };
}
