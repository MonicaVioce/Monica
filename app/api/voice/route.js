import { isVoiceWebhookAuthorized, xmlEscape } from '../../../lib/config.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  if (!isVoiceWebhookAuthorized(request)) return new Response(null, { status: 401 });
  const projectId = process.env.OPENAI_PROJECT_ID?.trim();
  if (!projectId?.startsWith('proj_')) {
    console.error('OPENAI_PROJECT_ID is missing or invalid; refusing to place a silent call.');
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Voice agent configuration is incomplete.</Say></Response>',
      { headers: { 'content-type': 'application/xml; charset=utf-8' } },
    );
  }

  let a1CallSid = '';
  try {
    const form = await request.formData();
    a1CallSid = String(form.get('CallSid') || form.get('call_sid') || '');
  } catch { /* A1 normally sends form data; the case ID header is optional */ }

  const caseHeader = a1CallSid ? `?X-A1-Call-Sid=${encodeURIComponent(a1CallSid)}` : '';
  const sipUri = `sip:${projectId}@sip.api.openai.com;transport=tls${caseHeader}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${xmlEscape(sipUri)}</Sip>
  </Dial>
</Response>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
