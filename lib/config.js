export function isVoiceWebhookAuthorized(request) {
  const token = process.env.VOICE_WEBHOOK_TOKEN;
  return !token || new URL(request.url).searchParams.get('token') === token;
}

export function isAdminAuthorized(request) {
  const token = process.env.MONICA_ADMIN_TOKEN;
  return Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`;
}

export function publicBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  return `${protocol}://${host}`;
}

export function fallbackCaseContext() {
  if (!process.env.MONICA_CASE_CONTEXT) return {};
  try { return JSON.parse(process.env.MONICA_CASE_CONTEXT); } catch { return {}; }
}

export function validateCaseContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Case context must be a JSON object.');
  const permitted = ['customer_name', 'company', 'reservation_or_case_id', 'issue', 'requested_resolution', 'acceptance_limit', 'authorized_actions'];
  const result = {};
  for (const key of permitted) {
    if (value[key] === undefined) continue;
    if (key === 'authorized_actions') {
      if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== 'string')) throw new Error('authorized_actions must be an array of strings.');
      result[key] = value[key].slice(0, 20);
    } else if (typeof value[key] !== 'string' || value[key].length > 2000) {
      throw new Error(`${key} must be a string of at most 2,000 characters.`);
    } else result[key] = value[key];
  }
  if (!result.customer_name || !result.company || !result.issue || !result.requested_resolution) throw new Error('customer_name, company, issue, and requested_resolution are required.');
  return result;
}

export function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
