let csrfToken = '';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.assign('/admin/login.html');
    throw new Error('Authentication required.');
  }
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

export async function loadAdminSession() {
  const body = await request('/api/auth/session');
  csrfToken = body.csrfToken;
  return body;
}

export async function listLeads() {
  const body = await request('/api/admin/leads');
  return body.leads;
}

export async function saveReview(id, { stage, note = '', reason = '' }) {
  const body = await request(`/api/admin/leads/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ stage, note, reason }),
  });
  return body.lead;
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
  csrfToken = '';
  location.assign('/admin/login.html');
}
