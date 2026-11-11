// Synthetic-identity guards for the demo. Contact details are only accepted when
// they sit in a namespace reserved for documentation/fiction, so a real person or
// business cannot be recorded by typing, importing or replaying a request.
//
//   Hostnames: example.com / example.net / example.org (and subdomains), and the
//              reserved TLDs .example, .test and .invalid (RFC 2606 / RFC 6761).
//   Phones:    North American numbers in the 555-0100..555-0199 block.
const RESERVED_SLD = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_TLD = new Set(['example', 'test', 'invalid']);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Lower-cased hostname without scheme, credentials, port, path, "www." or trailing dot. '' if unusable. */
export function normalizeDomain(input) {
  if (typeof input !== 'string') return '';
  let host = input.trim().toLowerCase();
  if (!host) return '';
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0];
  if (host.includes('@')) return '';
  host = host.replace(/:\d{1,5}$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return HOST_RE.test(host) ? host : '';
}

export function isReservedHost(host) {
  const domain = normalizeDomain(host);
  if (!domain) return false;
  const labels = domain.split('.');
  if (RESERVED_TLD.has(labels.at(-1))) return labels.length >= 2;
  return RESERVED_SLD.has(labels.slice(-2).join('.'));
}

export function isSyntheticEmail(email) {
  if (typeof email !== 'string') return false;
  const match = email.trim().toLowerCase().match(/^[a-z0-9][a-z0-9._%+-]{0,63}@([a-z0-9.-]+)$/);
  return Boolean(match) && isReservedHost(match[1]);
}

/** Returns "(AAA) 555-01XX" for a fictional number, otherwise ''. */
export function normalizeSyntheticPhone(phone) {
  if (typeof phone !== 'string' || !/^[\d\s().+-]{7,24}$/.test(phone.trim())) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10 || digits.slice(3, 8) !== '55501') return '';
  return `(${digits.slice(0, 3)}) 555-${digits.slice(6)}`;
}

/** Only http(s) URLs on a reserved host. Returns the normalized URL or ''. */
export function normalizeSyntheticUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return '';
  const raw = /^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  if (!isReservedHost(url.hostname)) return '';
  return url.href.slice(0, 300);
}

const CORPORATE_SUFFIXES = new Set(['llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'lp', 'llp', 'pllc']);

/** Comparison key for organization names: case, punctuation and legal suffixes removed. */
export function nameKey(name) {
  if (typeof name !== 'string') return '';
  const tokens = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens.at(-1))) tokens.pop();
  return tokens.join(' ');
}

export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Near match = small spelling difference between two reasonably long name keys. Never a merge signal on its own. */
export function isNearName(keyA, keyB) {
  if (!keyA || !keyB || keyA === keyB) return false;
  if (Math.min(keyA.length, keyB.length) < 8) return false;
  return editDistance(keyA, keyB, 2) <= 2;
}
