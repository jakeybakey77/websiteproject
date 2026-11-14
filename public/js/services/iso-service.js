// Authenticated ISO partner CRM client. Every mutation carries the session CSRF token.
let csrfToken = '';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const signal = AbortSignal.timeout(12000);
  let response, body;
  try {
    response = await fetch(path, { ...options, headers, credentials: 'same-origin', signal });
    body = await response.json();
  } catch (error) {
    if (signal.aborted) {
      throw new Error(options.method === 'POST'
        ? 'The request timed out. Reload the current status before trying again.'
        : 'Loading timed out. Try loading again.');
    }
    throw new Error('Could not read the server response. Reload the page and try again.', { cause: error });
  }
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
export const getAnalytics = async (query = {}) => (await request(`${ISO}/analytics?${new URLSearchParams(query)}`)).analytics;
export const getImports = () => request(`${ISO}/imports`);
export const previewImport = async (payload) => (await post('/imports/preview', payload)).preview;
export const commitImport = (payload) => post('/imports', payload);
export const resolveImportRow = (rowId, payload) => post(`/import-rows/${id(rowId)}/resolve`, payload);

// Each of these returns the refreshed organization detail.
export const orgAction = (orgId, action, payload) => post(`/organizations/${id(orgId)}/${action}`, payload);
export const reviewEvidence = (evidenceId, payload) => post(`/evidence/${id(evidenceId)}/review`, payload);
export const setContactStatus = (contactId, status) => post(`/contacts/${id(contactId)}/status`, { status });
export const completeFollowUp = (activityId) => post(`/activities/${id(activityId)}/complete`);

export const getReferralCodes = (orgId) => request(`${ISO}/organizations/${id(orgId)}/referral-codes`);
export const issueReferralCode = (orgId) => post(`/organizations/${id(orgId)}/referral-codes`);
export const rotateReferralCode = (orgId, reason) => post(`/organizations/${id(orgId)}/referral-codes/rotate`, { reason });
export const revokeReferralCode = (codeId, reason) => post(`/referral-codes/${id(codeId)}/revoke`, { reason });
export const getPartnerReferrals = (orgId, query) => request(`${ISO}/organizations/${id(orgId)}/referrals?${new URLSearchParams(query)}`);
