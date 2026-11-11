// Authenticated ISO partner CRM client. Every mutation carries the session CSRF token.
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

const ISO = '/api/admin/iso';
const post = (path, payload = {}) => request(`${ISO}${path}`, { method: 'POST', body: JSON.stringify(payload) });
const id = encodeURIComponent;

export async function loadAdminSession() {
  const body = await request('/api/auth/session');
  csrfToken = body.csrfToken;
  return body;
}
export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
  csrfToken = '';
  location.assign('/admin/login.html');
}

export const exportUrl = (query) => `${ISO}/export.csv?${new URLSearchParams(query)}`;
export const listOrganizations = async (query) => (await request(`${ISO}/organizations?${new URLSearchParams(query)}`)).organizations;
export const getOrganization = (orgId) => request(`${ISO}/organizations/${id(orgId)}`);
export const getAnalytics = async () => (await request(`${ISO}/analytics`)).analytics;
export const getImports = () => request(`${ISO}/imports`);
export const previewImport = async (payload) => (await post('/imports/preview', payload)).preview;
export const commitImport = (payload) => post('/imports', payload);
export const resolveImportRow = (rowId, payload) => post(`/import-rows/${id(rowId)}/resolve`, payload);

// Each of these returns the refreshed organization detail.
export const orgAction = (orgId, action, payload) => post(`/organizations/${id(orgId)}/${action}`, payload);
export const reviewEvidence = (evidenceId, payload) => post(`/evidence/${id(evidenceId)}/review`, payload);
export const setContactStatus = (contactId, status) => post(`/contacts/${id(contactId)}/status`, { status });
export const completeFollowUp = (activityId) => post(`/activities/${id(activityId)}/complete`);
