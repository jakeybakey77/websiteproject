import { STAGES } from '../config/pipeline.js';
import { ISO_STAGES, VERIFICATION_STATUSES, isoLabel } from '../config/iso-pipeline.js';
import { el } from '../lib/dom.js';
import { labelFor } from '../lib/format.js';
import { getReferralCodes, getPartnerReferrals, issueReferralCode, rotateReferralCode, revokeReferralCode } from '../services/iso-service.js';

const timestamp = (value) => value ? new Date(value).toLocaleString() : '—';
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const button = (text, onclick, disabled = false) => el('button', {
  type: 'button', class: 'button button-secondary button-small', text, onclick, disabled,
});

function table(label, headings, rows) {
  return el('div', { class: 'table-scroll', role: 'region', 'aria-label': label, tabindex: '0' },
    el('table', {}, el('thead', {}, el('tr', {}, headings.map((text) => el('th', { scope: 'col', text })))),
      el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell) => el('td', {}, cell)))))));
}

export function createReferralsPanel(orgId) {
  const codeContent = el('div');
  const issueStatus = el('p', { class: 'notice', role: 'status' });
  const records = el('div');
  const recordsStatus = el('p', { class: 'notice', role: 'status' });
  const from = el('input', { type: 'date', id: 'referrals-from' });
  const to = el('input', { type: 'date', id: 'referrals-to' });
  let dateWindow = {};
  let codesRequest = 0;
  let recordsRequest = 0;
  let changing = false;
  const dateFilters = el('form', { class: 'mini-form', onsubmit: (event) => {
    event.preventDefault();
    dateWindow = { from: from.value, to: to.value };
    loadRecords(1);
  } }, el('div', {}, el('label', { for: from.id, text: 'Received from (UTC)' }), from),
  el('div', {}, el('label', { for: to.id, text: 'Received through (UTC)' }), to),
  el('div', { class: 'actions' }, el('button', { class: 'button button-small', text: 'Apply dates', type: 'submit' })));
  const panel = el('section', { class: 'sheet panel referral-data', 'aria-labelledby': 'referrals-title' },
    el('h2', { id: 'referrals-title', tabindex: -1, text: 'Referrals' }),
    el('p', { class: 'tag', text: 'Synthetic demo' }),
    codeContent, issueStatus,
    el('h3', { class: 'panel-sub', text: 'Referred inquiries and stored counts' }),
    dateFilters, recordsStatus, records);

  async function change(action, success, focusId) {
    if (changing) return;
    changing = true;
    for (const control of codeContent.querySelectorAll('button, textarea')) control.disabled = true;
    issueStatus.textContent = 'Updating demo referral links…';
    let message;
    try {
      await action();
      message = success;
    } catch (error) {
      message = error.message || 'Could not confirm the change.';
    }
    changing = false;
    await loadCodes(message, focusId);
  }

  function renderCodes({ eligibility, activeCode, codes }) {
    const eligible = eligibility.eligible;
    const blocked = !eligible || changing;
    const missingRequirements = [
      eligibility.stage !== 'active_partner' ? 'Active Partner — address the relationship stage in Overview.' : null,
      eligibility.verificationStatus !== 'verified' ? 'Verified by reviewer — address business verification in Verification.' : null,
    ].filter(Boolean);
    const issue = button('Issue demo referral link', () =>
      change(() => issueReferralCode(orgId), 'Demo referral link is active.', 'referral-active-link'), blocked);
    issue.id = 'referral-issue';
    const actions = el('div', { class: 'detail-tags' });
    const activeLink = activeCode?.referralUrl;
    let active;
    if (activeLink) {
      const input = el('input', { id: 'referral-active-link', type: 'text', readonly: true, value: new URL(activeLink, location.origin).href });
      const copy = button('Copy', async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          issueStatus.textContent = 'Referral link copied.';
        } catch {
          input.focus();
          input.select();
          issueStatus.textContent = 'Select and copy the referral link from the field.';
        }
      }, blocked);
      const reason = el('textarea', { id: 'referral-link-reason', required: true, maxlength: 500, rows: 3,
        oninput: () => reason.setCustomValidity('') });
      let operation;
      let trigger;
      const confirm = el('button', { class: 'button button-small', type: 'submit' });
      const editor = el('form', { class: 'mini-form', hidden: true, onsubmit: (event) => {
        event.preventDefault();
        const explanation = reason.value.trim();
        if (explanation.replace(/\s/g, '').length < 10) {
          reason.setCustomValidity('Enter a reason with at least 10 non-whitespace characters.');
          reason.reportValidity();
          return;
        }
        const rotate = operation === 'rotate';
        const action = rotate ? () => rotateReferralCode(orgId, explanation) : () => revokeReferralCode(activeCode.id, explanation);
        change(action, rotate ? 'Demo referral link rotated.' : 'Demo referral link revoked.',
          rotate ? 'referral-active-link' : 'referral-issue');
      } }, el('div', { class: 'span' }, el('label', { for: reason.id, text: 'Reason (at least 10 non-whitespace characters)' }), reason),
      el('div', { class: 'actions' }, confirm, button('Cancel', () => { editor.hidden = true; trigger.focus(); })));
      function openReason(mode, source) {
        operation = mode;
        trigger = source;
        editor.reset();
        reason.setCustomValidity('');
        confirm.textContent = mode === 'rotate' ? 'Confirm rotation' : 'Confirm revocation';
        editor.hidden = false;
        reason.focus();
      }
      actions.append(copy, button('Rotate', (event) => openReason('rotate', event.currentTarget), blocked),
        button('Revoke', (event) => openReason('revoke', event.currentTarget), blocked));
      active = el('div', {}, el('label', { for: input.id, text: 'Active demo referral link' }), input, actions, editor);
    } else {
      actions.append(issue);
      active = actions;
    }
    codeContent.replaceChildren(
      el('h3', { class: 'panel-sub', text: 'Demo referral links' }),
      el('p', {}, 'Relationship stage: ' + isoLabel(ISO_STAGES, eligibility.stage)
        + ' · Verification: ' + isoLabel(VERIFICATION_STATUSES, eligibility.verificationStatus)),
      el('p', { class: 'dialog-note', hidden: eligible, text: 'Available only while the partner is Active and Verified.' }),
      el('p', { class: 'dialog-note', hidden: eligible, text: 'Missing: ' + missingRequirements.join(' ') }),
      active,
      el('h3', { class: 'panel-sub', text: 'Issuance history' }),
      codes.length ? table('Referral code issuance history', ['Status', 'Created', 'Created by', 'Revoked', 'Revoked by', 'Reason'],
        codes.map((entry) => [entry.status === 'active' ? 'Active' : 'Revoked', timestamp(entry.createdAt),
          entry.createdBy, timestamp(entry.revokedAt), entry.revokedBy || '—', entry.revokeReason || '—']))
        : el('p', { class: 'empty', text: 'No demo referral links have been issued.' }));
  }

  async function loadCodes(message = '', focusId) {
    const request = ++codesRequest;
    try {
      const result = await getReferralCodes(orgId);
      if (request !== codesRequest) return;
      renderCodes(result);
      issueStatus.textContent = message;
      if (focusId && !panel.closest('[hidden]')) {
        const target = codeContent.querySelector('#' + focusId);
        (target && !target.disabled ? target : panel.querySelector('#referrals-title')).focus();
      }
    } catch (error) {
      if (request !== codesRequest) return;
      codeContent.replaceChildren(button('Retry loading links', () => loadCodes()));
      issueStatus.textContent = [message, error.message || 'Could not load referral links.'].filter(Boolean).join(' ');
    }
  }

  async function loadRecords(page) {
    const request = ++recordsRequest;
    recordsStatus.textContent = 'Loading referred inquiries…';
    try {
      const result = await getPartnerReferrals(orgId, { ...dateWindow, page });
      if (request !== recordsRequest) return;
      const { items, pageSize, total, summary } = result;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (page > pages) { await loadRecords(pages); return; }
      const metric = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', { text: String(value) }));
      records.replaceChildren(
        el('dl', { class: 'insight-stats' },
          metric('Attributed inquiries', summary.attributedInquiries),
          metric('All merchant inquiries in this window', summary.totalMerchantInquiries),
          metric('Share of submissions', summary.partnerShareOfSubmissions == null ? 'No data' : percent.format(summary.partnerShareOfSubmissions)),
          metric('Review ready (not an approval)', summary.reviewReadyCount),
          metric('Handoffs (simulated, not funded)', summary.simulatedHandoffCount)),
        el('p', { class: 'dialog-note', text: result.notes.basis }),
        el('details', {}, el('summary', { text: 'Merchant stage counts' }),
          el('dl', { class: 'ledger' }, STAGES.map(({ value, label }) => metric(label, summary.merchantStageBreakdown[value])))),
        el('details', {}, el('summary', { text: 'Referrals by received date' }),
          summary.newReferralsByDay.length ? table('Referrals by date', ['Received date (UTC)', 'Count'],
            summary.newReferralsByDay.map(({ date, count }) => [date, String(count)]))
            : el('p', { class: 'empty', text: 'No referrals in this date window.' })),
        items.length ? table('Referred inquiries', ['Inquiry', 'Received', 'Merchant stage', 'Method', 'Attributed'],
          items.map((item) => [
            el('a', { href: '/admin/#lead=' + encodeURIComponent(item.leadId), text: item.leadId }),
            timestamp(item.receivedAt), labelFor(STAGES, item.merchantStage),
            item.method === 'manual' ? 'Manual' : 'Public referral link', timestamp(item.attributedAt),
          ])) : el('p', { class: 'empty', text: 'No referred inquiries in this date window.' }),
        pages > 1 ? el('div', { class: 'detail-tags' },
          button('Previous page', () => loadRecords(page - 1), page <= 1),
          button('Next page', () => loadRecords(page + 1), page >= pages)) : null);
      recordsStatus.textContent = 'Page ' + page + ' of ' + pages + ' · ' + total + ' referred inquiries';
      if (document.activeElement === document.body && !panel.closest('[hidden]')) {
        recordsStatus.tabIndex = -1;
        recordsStatus.focus();
      }
    } catch (error) {
      if (request !== recordsRequest) return;
      recordsStatus.textContent = error.message || 'Could not load referred inquiries.';
    }
  }

  return { panel, refresh() {
    if (!changing) {
      issueStatus.textContent = 'Loading demo referral links…';
      loadCodes();
    }
    loadRecords(1);
  } };
}
