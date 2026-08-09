import OpenAI from 'openai';
import {
  acceptSipCall,
  monitorSipCall,
  prepareSipCase,
  sipHeader,
} from '../../../../lib/openai-sip.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

const acceptedEvents = globalThis.__monicaAcceptedSipEvents || new Set();
globalThis.__monicaAcceptedSipEvents = acceptedEvents;

function caseIdFromEvent(event) {
  const encoded = sipHeader(event.data?.sip_headers, 'X-A1-Call-Sid');
  if (!encoded) return event.data.call_id;
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_WEBHOOK_SECRET) {
    console.error('OpenAI SIP webhook is missing OPENAI_API_KEY or OPENAI_WEBHOOK_SECRET.');
    return new Response('OpenAI SIP is not configured.', { status: 503 });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    webhookSecret: process.env.OPENAI_WEBHOOK_SECRET,
  });

  let event;
  try {
    event = await client.webhooks.unwrap(await request.text(), request.headers);
  } catch (error) {
    if (error instanceof OpenAI.InvalidWebhookSignatureError) {
      console.warn('Rejected an OpenAI webhook with an invalid signature.');
      return new Response('Invalid signature.', { status: 400 });
    }
    console.error('Could not parse OpenAI webhook:', error.message);
    return new Response('Invalid webhook.', { status: 400 });
  }

  if (event.type !== 'realtime.call.incoming') return new Response(null, { status: 200 });
  if (acceptedEvents.has(event.id)) return new Response(null, { status: 200 });
  acceptedEvents.add(event.id);
  if (acceptedEvents.size > 1000) acceptedEvents.delete(acceptedEvents.values().next().value);

  try {
    const callId = event.data.call_id;
    const caseId = caseIdFromEvent(event);
    const caseRecord = await prepareSipCase(caseId);
    await acceptSipCall(callId, caseRecord.context);
    monitorSipCall(callId, caseId, caseRecord);
    console.log('Accepted OpenAI SIP call', callId, 'for case', caseId);
    return new Response(null, { status: 200 });
  } catch (error) {
    acceptedEvents.delete(event.id);
    console.error('Failed to accept OpenAI SIP call:', error.message);
    return new Response('Could not accept call.', { status: 502 });
  }
}
