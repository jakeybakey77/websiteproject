// Public inquiry API client. The server is the authoritative writer.
// The shipped form remains demo-only and sends only built-in fictional contact identities.

export async function submitInquiry(answers, { identity, source, medium = '', campaign = '', referralCode, submissionId }) {
  const response = await fetch('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, identity, source, medium, campaign, referralCode, submissionId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || 'Demo inquiry submission failed.'), {
    status: response.status, code: body.code, fieldErrors: body.fieldErrors,
  });
  return body;
}
