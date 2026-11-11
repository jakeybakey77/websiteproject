// Runs the rules in config/validation-rules.js against one inquiry.
// Pure functions, no DOM, so this can move to a server unchanged.
//
// The only possible results are the three outcomes below. They route an inquiry
// to a person; they are not financing decisions. validateRules() throws if a
// rule is configured with any other outcome.

export const OUTCOMES = Object.freeze({
  READY_FOR_REVIEW: 'ready_for_review',
  NEEDS_INFO: 'needs_info',
  MANUAL_REVIEW: 'manual_review',
});

export const OUTCOME_LABELS = Object.freeze({
  [OUTCOMES.READY_FOR_REVIEW]: 'Ready for review',
  [OUTCOMES.NEEDS_INFO]: 'Needs info',
  [OUTCOMES.MANUAL_REVIEW]: 'Manual review',
});

// A rule can only raise one of these two. "Ready for review" means no rule fired.
// Listed in precedence order: if both are raised, the inquiry needs info first.
const FLAG_OUTCOMES = [OUTCOMES.NEEDS_INFO, OUTCOMES.MANUAL_REVIEW];

const isBlank = (value) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

// Each handler returns true (or a short detail string) when the rule fires.
const handlers = {
  requiredFields(lead, { fields }) {
    const missing = fields.filter((name) => isBlank(lead[name]));
    return missing.length > 0 && `Missing: ${missing.join(', ')}`;
  },
  followUpWhen(lead, { field, equals, unlessPresent }) {
    return lead[field] === equals && (!unlessPresent || isBlank(lead[unlessPresent]));
  },
  allowedValues(lead, { field, values }) {
    return !isBlank(lead[field]) && !values.includes(lead[field]);
  },
  ratioAbove(lead, { numerator, denominator, threshold }) {
    const top = lead[numerator];
    const bottom = lead[denominator];
    return typeof top === 'number' && typeof bottom === 'number' && bottom > 0 && top / bottom > threshold;
  },
};

export function validateRules(config) {
  for (const rule of config.rules) {
    if (!handlers[rule.type]) {
      throw new Error(`Rule "${rule.id}": unknown type "${rule.type}".`);
    }
    if (!FLAG_OUTCOMES.includes(rule.outcome)) {
      throw new Error(
        `Rule "${rule.id}": outcome "${rule.outcome}" is not allowed. ` +
          `Rules may only raise ${FLAG_OUTCOMES.join(' or ')}; they cannot approve or decline.`,
      );
    }
    if (rule.enabled && rule.type === 'allowedValues' &&
        (!Array.isArray(rule.params?.values) || rule.params.values.length === 0)) {
      throw new Error(`Rule "${rule.id}": enabling allowedValues requires a non-empty values list.`);
    }
    if (rule.enabled && rule.type === 'requiredFields' &&
        (!Array.isArray(rule.params?.fields) || rule.params.fields.length === 0)) {
      throw new Error(`Rule "${rule.id}": enabling requiredFields requires a non-empty fields list.`);
    }
    if (rule.enabled && rule.type === 'ratioAbove' && (!Number.isFinite(rule.params?.threshold) || rule.params.threshold < 0)) {
      throw new Error(`Rule "${rule.id}": set a numeric threshold before enabling it.`);
    }
  }
}

export function evaluateLead(lead, config) {
  validateRules(config);
  const flags = [];
  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const fired = handlers[rule.type](lead, rule.params);
    if (!fired) continue;
    flags.push({
      ruleId: rule.id,
      category: rule.category || 'other',
      outcome: rule.outcome,
      message: typeof fired === 'string' ? `${rule.message} ${fired}` : rule.message,
    });
  }
  const status =
    FLAG_OUTCOMES.find((outcome) => flags.some((flag) => flag.outcome === outcome)) ??
    OUTCOMES.READY_FOR_REVIEW;
  return { status, flags, rulesVersion: config.version };
}
