import { isAdminAuthorized, validateCaseContext } from '../../../../lib/config.js';
import { putCase } from '../../../../lib/cases.js';

export const runtime = 'nodejs';

function isDemoAuthorized(request) {
  return process.env.NODE_ENV !== 'production' || isAdminAuthorized(request);
}

export async function POST(request) {
  if (!isDemoAuthorized(request)) return new Response(null, { status: 401 });
  if (!process.env.A1_TEAM_KEY) return Response.json({ error: 'A1_TEAM_KEY is not configured.' }, { status: 503 });
  try {
    const contentType = request.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const context = validateCaseContext({
      ...payload,
      authorized_actions: payload.authorized_actions || ['Request a manager', 'Request a case number'],
    });
    const response = await fetch('https://hack.a1mobile.com/api/calls', { method: 'POST', headers: { 'X-Team-Key': process.env.A1_TEAM_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: context.customer_phone }) });
    const call = await response.json().catch(() => ({}));
    if (!response.ok || !call.call_sid) return Response.json({ error: call.detail || 'The call could not be started.' }, { status: response.status || 502 });
    await putCase(call.call_sid, { status: 'prepared', context, notes: [], transcript: [], follow_up: null, approval: null, updated_at: new Date().toISOString() });
    if (!contentType.includes('application/json')) {
      return Response.redirect(new URL(`/?call_sid=${encodeURIComponent(call.call_sid)}`, request.url), 303);
    }
    return Response.json({ call_sid: call.call_sid, status: call.status || 'queued' }, { status: 201 });
  } catch (error) {
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
      return Response.redirect(new URL(`/?error=${encodeURIComponent(error.message)}`, request.url), 303);
    }
    return Response.json({ error: error.message }, { status: 400 });
  }
}
