// Public ISO / referral-partner application client. Separate endpoint from the
// merchant inquiry. Sends only a built-in fictional partner identity.
export async function submitPartnerApplication(answers, { identity, source, medium = '', campaign = '' }) {
  const response = await fetch('/api/iso/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, identity, source, medium, campaign }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error || 'Demo partner application failed.'), { fieldErrors: body.fieldErrors ?? null });
  }
  return body;
}
