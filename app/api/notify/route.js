import { sendSms } from '../../../lib/notify.js';
import { isAdminAuthorized } from '../../../lib/config.js';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!isAdminAuthorized(request)) return new Response(null, { status: 401 });
  try {
    const { to, body } = await request.json();
    if (!to || !body) return Response.json({ error: 'to and body are required.' }, { status: 400 });
    return Response.json(await sendSms(String(to), String(body).slice(0, 1000)));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
