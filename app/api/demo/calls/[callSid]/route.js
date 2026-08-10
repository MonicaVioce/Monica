import { isAdminAuthorized } from '../../../../../lib/config.js';
import { getCase } from '../../../../../lib/cases.js';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401 });
  const { callSid } = await params;
  const caseRecord = await getCase(callSid);
  if (!caseRecord) return new Response(null, { status: 404 });
  return Response.json(caseRecord, { headers: { 'Cache-Control': 'no-store' } });
}
