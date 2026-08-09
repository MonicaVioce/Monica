import { isVoiceWebhookAuthorized } from '../../../lib/config.js';

export async function POST(request) {
  if (!isVoiceWebhookAuthorized(request)) return new Response(null, { status: 401 });
  const body = await request.text();
  console.log('A1 stream status:', body.slice(0, 4_000));
  return Response.json({ ok: true });
}
