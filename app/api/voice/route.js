import { isVoiceWebhookAuthorized, publicBaseUrl, xmlEscape } from '../../../lib/config.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  if (!isVoiceWebhookAuthorized(request)) return new Response(null, { status: 401 });
  const form = await request.formData();
  const callSid = String(form.get('CallSid') || 'unknown');
  const base = publicBaseUrl(request);
  const token = process.env.VOICE_WEBHOOK_TOKEN;
  const streamUrl = `${base.replace(/^http/, 'ws')}/api/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${xmlEscape(streamUrl)}" track="inbound_track" codec="PCMU" bidirectionalMode="rtp" bidirectionalCodec="PCMU" bidirectionalSamplingRate="8000">
      <Parameter name="call_sid" value="${xmlEscape(callSid)}" />
    </Stream>
  </Connect>
  <Hangup/>
</Response>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
