import { el } from '../lib/dom.js';
import { getLeadReferral, listEligibleReferralPartners, saveLeadReferral } from '../services/admin-service.js';

const direct = 'Direct / unattributed';
const timestamp = (value) => value ? new Date(value).toLocaleString() : '—';

export function referralPartnerLink(id, name) {
  return id ? el('a', { href: '/admin/iso.html#org=' + encodeURIComponent(id), text: name || id }) : direct;
}

export function leadReferralPanel(leadId, onSaved) {
  const notice = el('p', { role: 'status', class: 'dialog-note', text: 'Loading referral attribution…' });
  const details = el('div');
  const editor = el('div');
  const panel = el('section', { class: 'lead-referral-panel', 'aria-labelledby': 'lead-referral-title' },
    el('h3', { id: 'lead-referral-title', text: 'Referral attribution' }), notice, details, editor);

  function display({ current, original, history }) {
    const field = (label, value) => el('div', {}, el('dt', { text: label }), el('dd', {}, value));
    details.replaceChildren(el('dl', { class: 'ledger' },
      field('Current credit', referralPartnerLink(current?.isoOrganizationId, current?.isoDisplayName)),
      field('Attribution method', current ? (current.method === 'manual' ? 'Manual correction' : 'Public referral link') : '—'),
      field('Attributed on', timestamp(current?.firstAttributedAt)),
      field('Last updated', current ? timestamp(current.updatedAt) + ' · ' + current.updatedBy : '—'),
      field('Original public-link credit', original ? referralPartnerLink(original.isoOrganizationId, original.isoDisplayName) : 'None'),
      original && field('Original attribution date', timestamp(original.at))),
    el('h4', { text: 'Attribution history' }),
    history.length ? el('ol', { class: 'review-history' }, history.map((event) => el('li', {},
      el('strong', { text: event.eventType[0].toUpperCase() + event.eventType.slice(1) }),
      ' · ' + timestamp(event.at) + ' · ' + event.actor,
      el('p', {}, referralPartnerLink(event.oldIsoOrganizationId, event.oldIsoDisplayName), ' → ',
        referralPartnerLink(event.newIsoOrganizationId, event.newIsoDisplayName)),
      el('p', { text: event.reason || '—' })))) : el('p', { class: 'dialog-note', text: 'No attribution history.' }));
  }

  async function load() {
    try {
      const referral = await getLeadReferral(leadId);
      display(referral);
      notice.textContent = '';
      const partners = await listEligibleReferralPartners();
      const select = el('select', { id: 'referral-target', required: true },
        el('option', { value: '', text: 'Choose an action' }),
        el('option', { value: 'remove', text: 'Remove attribution' }),
        partners.map((partner) => el('option', { value: partner.id, text: partner.displayName })));
      const reason = el('textarea', { id: 'referral-reason', required: true, maxlength: 500, rows: 3, 'aria-describedby': 'referral-reason-help' });
      const submit = el('button', { type: 'submit', class: 'button button-small', text: 'Confirm correction' });
      const feedback = el('p', { class: 'dialog-note', role: 'status' });
      let requestId;
      let pending = false;
      const form = el('form', { class: 'review-form',
        oninput: () => { requestId = undefined; reason.setCustomValidity(''); },
        onsubmit: async (event) => {
          event.preventDefault();
          if (pending) return;
          const explanation = reason.value.trim();
          if (explanation.replace(/\s/g, '').length < 10) {
            reason.setCustomValidity('Enter a reason with at least 10 non-whitespace characters.');
            reason.reportValidity();
            return;
          }
          const target = select.value === 'remove' ? null : select.value;
          if (!window.confirm(target ? 'Apply this referral correction?' : 'Remove referral attribution from this inquiry?')) return;
          requestId ??= crypto.randomUUID();
          pending = true;
          select.disabled = reason.disabled = submit.disabled = true;
          feedback.textContent = 'Saving attribution…';
          try {
            const result = await saveLeadReferral(leadId, { isoOrganizationId: target, reason: explanation, requestId });
            display(result.referral);
            onSaved(result.referral.current);
            feedback.textContent = result.changed ? 'Referral attribution saved.' : 'No change';
            form.reset();
            requestId = undefined;
          } catch (error) {
            feedback.textContent = error.status ? error.message : 'The correction could not be confirmed. Try again.';
          } finally {
            pending = false;
            select.disabled = reason.disabled = submit.disabled = false;
            if (form.isConnected) submit.focus();
          }
        },
      }, el('label', { for: 'referral-target', text: 'Correct attribution' }), select,
      el('label', { for: 'referral-reason', text: 'Reason' }), reason,
      el('p', { id: 'referral-reason-help', class: 'dialog-note', text: 'Enter at least 10 non-whitespace characters.' }), submit, feedback);
      editor.replaceChildren(form);
    } catch (error) {
      notice.textContent = error.message || 'Could not load referral attribution.';
    }
  }

  load();
  return panel;
}
