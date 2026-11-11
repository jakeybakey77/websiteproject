// Capture the actual UTM source without misclassifying unknown sources as direct.
// Unknown sources are kept as normalized slugs and displayed in one 'other' bucket.
import { SOURCES } from '../config/pipeline.js';

const KNOWN = new Set(SOURCES.map(({value}) => value).filter((value) => value !== 'other'));

export function sanitizeAttribution(value, maxLength = 80) {
  return typeof value === 'string' ? value.trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLength) : '';
}

export function normalizeSource(value) {
  if (value === null || value === undefined) return 'direct';
  const cleaned = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return cleaned || 'unrecognized';
}

export function sourceBucket(value) {
  return KNOWN.has(value) ? value : 'other';
}

export function sourceLabel(value) {
  if (sourceBucket(value) === 'other') return `Other / unrecognized (${sanitizeAttribution(value, 48) || 'unknown'})`;
  return SOURCES.find(({value: known}) => value === known)?.label ?? 'Other / unrecognized';
}

export function parseAttribution(params) {
  return {
    source: normalizeSource(params.get('utm_source')),
    medium: sanitizeAttribution(params.get('utm_medium'), 60).toLowerCase(),
    campaign: sanitizeAttribution(params.get('utm_campaign'), 80),
  };
}
