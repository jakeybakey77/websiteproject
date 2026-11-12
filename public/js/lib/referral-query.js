import { readReferralParam, REFERRAL_PARAM } from './referral-code.js';

export function carryInquiryQuery(destination, params) {
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', REFERRAL_PARAM]) {
    destination.searchParams.delete(key);
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    for (const value of params.getAll(key)) destination.searchParams.append(key, value);
  }
  const referral = readReferralParam(params);
  if (referral.status === 'ok' && ['/', '/apply.html'].includes(destination.pathname)) {
    destination.searchParams.set(REFERRAL_PARAM, referral.code);
  } else if (referral.status === 'invalid' && destination.pathname === '/apply.html') {
    for (const value of params.getAll(REFERRAL_PARAM)) destination.searchParams.append(REFERRAL_PARAM, value);
  }
  return destination;
}

export function updateCampaignLinks(params) {
  for (const link of document.querySelectorAll('a[data-carry-query]')) {
    const destination = new URL(link.href);
    if (destination.origin === location.origin) link.href = carryInquiryQuery(destination, params).href;
  }
}
