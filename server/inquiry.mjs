import { randomBytes } from 'node:crypto';
import { DEMO_IDENTITIES } from '../public/js/data/demo-identities.js';
import { STEPS } from '../public/js/config/form-schema.js';
import { normalizeAnswers, validateStep } from '../public/js/lib/field-validators.js';
import { normalizeSource, sanitizeAttribution } from '../public/js/lib/attribution.js';
import { isWellFormedReferralCode, isWellFormedSubmissionId } from '../public/js/lib/referral-code.js';

function demoIdentityMatches(identity) {
  if (!identity || typeof identity !== 'object') return false;
  return DEMO_IDENTITIES.some((candidate) =>
    ['contactName', 'businessName', 'email', 'phone'].every((key) => candidate[key] === identity[key]));
}

export function validateInquiryPayload(payload, { demoMode = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new Error('Invalid inquiry payload.'), { statusCode: 400 });
  }
  const rawAnswers = payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers)
    ? payload.answers : {};
  const errors = {};
  for (const step of STEPS) Object.assign(errors, validateStep(step.id, rawAnswers));
  if (Object.keys(errors).length > 0) {
    throw Object.assign(new Error('Inquiry validation failed.'), { statusCode: 422, fieldErrors: errors });
  }

  if (demoMode && !demoIdentityMatches(payload.identity)) {
    throw Object.assign(new Error('Demo submissions must use one of the built-in fictional identities.'), { statusCode: 422 });
  }

  const answers = normalizeAnswers(rawAnswers);
  if (demoMode && answers.demoAcknowledged !== true) {
    throw Object.assign(new Error('Demo acknowledgement is required.'), { statusCode: 422 });
  }

  // Optional v2.3 fields. Absent (or null) means a normal direct inquiry / a legacy client.
  // Anything present but malformed is refused rather than guessed at: an array, a repeated
  // value or a wrong-shaped code never falls back to "direct" or to some other partner.
  const referralCode = payload.referralCode ?? null;
  if (referralCode !== null && !isWellFormedReferralCode(referralCode)) {
    throw Object.assign(new Error('This referral link is not valid. Remove the referral code to continue as a direct demo inquiry.'), { statusCode: 422, errorCode: 'referral_unavailable' });
  }
  const submissionId = payload.submissionId ?? null;
  if (submissionId !== null && !isWellFormedSubmissionId(submissionId)) {
    throw Object.assign(new Error('submissionId must be a UUID or a random string of 16 to 64 characters.'), { statusCode: 422 });
  }

  return {
    answers,
    identity: payload.identity,
    referralCode,
    submissionId,
    attribution: {
      source: normalizeSource(payload.source),
      medium: sanitizeAttribution(payload.medium, 60).toLowerCase(),
      campaign: sanitizeAttribution(payload.campaign, 80),
    },
  };
}

export function createLeadFromInquiry(validated, { demoMode = true } = {}) {
  const now = new Date().toISOString();
  return {
    id: `${demoMode ? 'DEMO' : 'GCP'}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
    demo: demoMode,
    ...validated.identity,
    ...validated.answers,
    stage: 'new',
    followUpReason: '',
    source: validated.attribution.source,
    medium: validated.attribution.medium,
    campaign: validated.attribution.campaign,
    receivedAt: now,
    reviewHistory: [],
    workflowMilestones: {},
  };
}
