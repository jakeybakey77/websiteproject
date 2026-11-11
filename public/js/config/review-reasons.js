// Structured operational reasons, never funding eligibility or credit decisions.
// These help a demo reviewer document why a fictional inquiry needs a follow-up
// or is removed from the operational queue.
export const REVIEW_REASONS = Object.freeze([
  {value: 'missing_business_details', label: 'Missing business details'},
  {value: 'existing_financing_unclear', label: 'Existing financing needs clarification'},
  {value: 'funding_purpose_unclear', label: 'Funding purpose needs clarification'},
  {value: 'unable_to_contact', label: 'Unable to contact (simulation)'},
  {value: 'duplicate_inquiry', label: 'Duplicate inquiry (simulation)'},
  {value: 'merchant_withdrew', label: 'Merchant no longer interested (simulation)'},
  {value: 'other_operational', label: 'Other operational follow-up'},
  {value: 'screening_exception_documented', label: 'Documented screening exception (simulation)'},
]);

export const REASON_REQUIRED_STAGES = Object.freeze(['needs_info', 'closed']);
export const reviewReasonLabel = (value) => REVIEW_REASONS.find((r) => r.value === value)?.label || 'Not recorded';
