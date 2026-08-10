import { isAdminAuthorized } from '../../../../../lib/config.js';
import { endSipCallForCase } from '../../../../../lib/openai-sip.js';
import { updateCase } from '../../../../../lib/cases.js';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401 });
  const { callSid } = await params;
  try {
    const ended = await endSipCallForCase(callSid);
    await updateCase(callSid, (current) => ({ ...current, status: 'completed', updated_at: new Date().toISOString() }));
    return Response.json({ call_sid: callSid, status: 'completed', active_sip_call_ended: ended });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 502 });
  }
}
