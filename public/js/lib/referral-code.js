// Single definition of the referral-code and submission-key wire formats.
// Shared by the server (authoritative) and the browser (early feedback only).
//
// A referral code is a public attribution marker for a synthetic demo link.
// It is not a credential, grants no access, and never encodes an ISO id.
export const REFERRAL_CODE_PREFIX = 'gcp_';
export const REFERRAL_CODE_TOKEN_LENGTH = 24; // 18 random bytes (144 bits) as base64url
export const REFERRAL_CODE_PATTERN = /^gcp_[A-Za-z0-9_-]{24}$/;
export const REFERRAL_PARAM = 'ref';

// Client-generated idempotency key: a UUID or another bounded random string.
export const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const isWellFormedReferralCode = (value) => typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value);
export const isWellFormedSubmissionId = (value) => typeof value === 'string' && SUBMISSION_ID_PATTERN.test(value);

/**
 * Reads the referral parameter from a URLSearchParams without guessing.
 *   { status: 'none' }            no ref parameter: a normal direct inquiry
 *   { status: 'ok', code }        exactly one well-formed code
 *   { status: 'invalid', reason } repeated or malformed: never pick one arbitrarily
 */
export function readReferralParam(params) {
  const all = params.getAll(REFERRAL_PARAM);
  if (all.length === 0) return { status: 'none' };
  if (all.length > 1) return { status: 'invalid', reason: 'multiple' };
  if (!isWellFormedReferralCode(all[0])) return { status: 'invalid', reason: 'malformed' };
  return { status: 'ok', code: all[0] };
}

/** Relative demo link for a code. An absolute origin is only ever added by the server from vetted configuration. */
export const referralPath = (code) => `/apply.html?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
