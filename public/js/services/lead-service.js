// Public inquiry API client. The server is the authoritative writer.
// The shipped form remains demo-only and sends only built-in fictional contact identities.

export async function submitInquiry(answers, { identity, source, medium = '', campaign = '' }) {
  const response = await fetch('/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, identity, source, medium, campaign }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Demo inquiry submission failed.');
  return body;
}
