import { getCase, putCase } from '../../../../lib/cases.js';
import { isAdminAuthorized, validateCaseContext } from '../../../../lib/config.js';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401 });
  const { callSid } = await params;
  const caseRecord = await getCase(callSid);
  return caseRecord ? Response.json(caseRecord) : new Response(null, { status: 404 });
}

export async function PUT(request, { params }) {
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401 });
  try {
    const { callSid } = await params;
    const context = validateCaseContext(await request.json());
    await putCase(callSid, { status: 'prepared', context, notes: [], transcript: [], follow_up: null, approval: null, updated_at: new Date().toISOString() });
    return Response.json({ call_sid: callSid, status: 'prepared' }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
