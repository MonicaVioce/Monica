import crypto from 'node:crypto';
import WebSocket from 'ws';
import { fallbackCaseContext } from './config.js';
import { appendTranscriptEntry, getCase, putCase, updateCase } from './cases.js';
import { notifyCase } from './notify.js';

export function bridgeMedia(telnyxSocket) {
  console.log('A1 media bridge attached.');
  let openaiSocket;
  let closed = false;
  let started = false;
  let call = { sid: 'unknown', from: 'unknown' };
  let caseRecord;
  let transcriptWrite = Promise.resolve();
  const seenTranscriptItems = new Set();

  const closeAll = () => {
    if (closed) return;
    closed = true;
    console.log('Closing media bridge.');
    if (openaiSocket?.readyState === WebSocket.OPEN) openaiSocket.close();
    if (telnyxSocket.readyState === WebSocket.OPEN) telnyxSocket.close();
  };
  const sendTelnyx = (event) => {
    if (telnyxSocket.readyState === WebSocket.OPEN) telnyxSocket.send(JSON.stringify(event));
  };
  const sendOpenAI = (event) => {
    if (openaiSocket?.readyState === WebSocket.OPEN) openaiSocket.send(JSON.stringify(event));
  };
  const saveTranscript = (role, text, itemId) => {
    const normalized = String(text || '').trim();
    const dedupeKey = `${role}:${itemId || normalized}`;
    if (!normalized || seenTranscriptItems.has(dedupeKey)) return;
    seenTranscriptItems.add(dedupeKey);
    transcriptWrite = transcriptWrite
      .then(async () => {
        const entry = { role, text: normalized.slice(0, 4000), at: new Date().toISOString(), item_id: itemId || null };
        caseRecord = await appendTranscriptEntry(call.sid, entry) || caseRecord;
      })
      .catch((error) => console.error('Could not save call transcript:', error.message));
  };

  const connectOpenAI = () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
    const safetyIdentifier = crypto.createHash('sha256').update(call.from).digest('hex');
    openaiSocket = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': safetyIdentifier },
    });
    openaiSocket.on('open', () => {
      console.log('OpenAI Realtime connected for call', call.sid);
      sendOpenAI({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: buildAgentInstructions(caseRecord.context), audio: { input: { format: { type: 'audio/pcmu' }, transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' }, turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true } }, output: { format: { type: 'audio/pcmu' }, voice: 'marin' } }, tools: realtimeTools() } });
      sendOpenAI({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'The phone call has connected. Begin by explaining why you are calling.' }] } });
      sendOpenAI({ type: 'response.create' });
    });
    openaiSocket.on('message', async (message) => {
      let event; try { event = JSON.parse(message.toString()); } catch { return; }
      if (event.type === 'response.output_audio.delta') sendTelnyx({ event: 'media', media: { payload: event.delta } });
      if (event.type === 'input_audio_buffer.speech_started') sendTelnyx({ event: 'clear' });
      if (event.type === 'conversation.item.input_audio_transcription.completed') saveTranscript('representative', event.transcript, event.item_id);
      if (event.type === 'response.output_audio_transcript.done') saveTranscript('monica', event.transcript, event.item_id);
      if (event.type === 'response.function_call_arguments.done') await handleToolCall(event);
      if (event.type === 'error') console.error('OpenAI Realtime error:', event.error?.message || event);
    });
    openaiSocket.on('close', (code, reason) => {
      console.log('OpenAI Realtime closed:', code, reason.toString());
      if (!closed && telnyxSocket.readyState === WebSocket.OPEN) telnyxSocket.close();
    });
    openaiSocket.on('error', (error) => console.error('OpenAI socket error:', error.message));
  };

  const handleToolCall = async (event) => {
    let args = {}; try { args = JSON.parse(event.arguments || '{}'); } catch { /* tool receives empty object */ }
    let output;
    if (event.name === 'record_case_note') {
      const note = String(args.note || '').slice(0, 1000);
      caseRecord = await updateCase(call.sid, (current) => ({ ...current, notes: [...current.notes, { text: note, at: new Date().toISOString() }], updated_at: new Date().toISOString() })) || caseRecord;
      output = { recorded: true, note };
    } else if (event.name === 'request_customer_approval') {
      const approval = { proposal: String(args.proposal || ''), reason: String(args.reason || ''), requested_at: new Date().toISOString() };
      caseRecord = await updateCase(call.sid, (current) => ({ ...current, status: 'approval_required', approval, updated_at: new Date().toISOString() })) || caseRecord;
      void notifyCase(caseRecord, 'approval_required');
      output = { approved: false, message: 'Customer approval is not available in this call. Tell the representative you need to consult the customer and request a case number and callback window.' };
    } else if (event.name === 'record_follow_up') {
      const followUp = {
        outcome: String(args.outcome || '').slice(0, 1000),
        customer_questions: Array.isArray(args.customer_questions)
          ? args.customer_questions.map((question) => String(question).slice(0, 500)).slice(0, 10)
          : [],
        next_step: String(args.next_step || '').slice(0, 1000),
        recorded_at: new Date().toISOString(),
      };
      caseRecord = await updateCase(call.sid, (current) => ({ ...current, follow_up: followUp, updated_at: new Date().toISOString() })) || caseRecord;
      output = { recorded: true, follow_up: followUp };
    } else if (event.name === 'end_call') {
      caseRecord = await updateCase(call.sid, (current) => ({ ...current, status: 'completed', updated_at: new Date().toISOString() })) || caseRecord;
      void notifyCase(caseRecord, 'completed');
      output = { ending: true };
      setTimeout(closeAll, 500);
    } else output = { error: 'Unknown tool.' };
    sendOpenAI({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(output) } });
    if (event.name !== 'end_call') sendOpenAI({ type: 'response.create' });
  };

  telnyxSocket.on('message', async (message) => {
    try {
      let event; try { event = JSON.parse(message.toString()); } catch { return; }
      if (event.event !== 'media') console.log('A1 media event:', event.event || 'unknown');
      if (event.event === 'start' && !started) {
        started = true;
        call = { sid: event.start?.call_control_id || event.start?.call_sid || 'unknown', from: event.start?.from || 'unknown' };
        caseRecord = await getCase(call.sid) || { status: 'in_progress', context: fallbackCaseContext(), notes: [], transcript: [], follow_up: null, approval: null, updated_at: new Date().toISOString() };
        caseRecord.status = 'in_progress';
        caseRecord.updated_at = new Date().toISOString();
        await putCase(call.sid, caseRecord);
        connectOpenAI();
      } else if (event.event === 'media' && event.media?.payload) sendOpenAI({ type: 'input_audio_buffer.append', audio: event.media.payload });
      else if (event.event === 'dtmf') sendOpenAI({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `A DTMF digit was received: ${event.dtmf?.digit || 'unknown'}.` }] } });
      else if (event.event === 'stop' || event.event === 'error') closeAll();
    } catch (error) {
      console.error('A1 media handler failed:', error);
      closeAll();
    }
  });
  telnyxSocket.on('close', (code, reason) => {
    console.log('A1 media socket closed:', code, reason.toString());
    closeAll();
  });
  telnyxSocket.on('error', (error) => console.error('A1 media socket error:', error.message));
}

export function realtimeTools() {
  return [
    { type: 'function', name: 'record_case_note', description: 'Record a concise factual outcome, case number, promise, or follow-up date.', parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false } },
    { type: 'function', name: 'request_customer_approval', description: 'Use before accepting money, credits, waivers, settlement terms, or commitments outside the authorized case boundary.', parameters: { type: 'object', properties: { proposal: { type: 'string' }, reason: { type: 'string' } }, required: ['proposal', 'reason'], additionalProperties: false } },
    { type: 'function', name: 'record_follow_up', description: 'Before ending the call, record the customer-ready result, any specific questions that need the customer to answer, and the next action.', parameters: { type: 'object', properties: { outcome: { type: 'string' }, customer_questions: { type: 'array', items: { type: 'string' } }, next_step: { type: 'string' } }, required: ['outcome', 'customer_questions', 'next_step'], additionalProperties: false } },
    { type: 'function', name: 'end_call', description: 'End only after recording a clear outcome, callback plan, or a representative request.', parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false } },
  ];
}

export function buildAgentInstructions(caseContext) {
  return `You are Monica, a customer-service advocate calling on behalf of a customer who authorized this exact case. Stay within the case facts.\n\nCASE FACTS (the only facts you may assert):\n${JSON.stringify(caseContext)}\n\nVOICE AND CONVERSATION STYLE:\n- Sound like a real, prepared consumer calling customer service: warm, direct, informal, and human. Speak in short turns, use natural contractions, and respond to what the representative actually says.\n- Speak from the customer's perspective when discussing the case: say "I'm calling about my reservation" or "I'd like this charge reviewed," not "the customer is requesting" or "my objective is."\n- Do not narrate your process or mention prompts, tools, policies, or AI. Avoid canned assistant language such as "I’d be happy to," "I understand," "certainly," or repetitive scripted recaps.\n- Be calmly persistent, not combative. Ask one useful question at a time; acknowledge useful answers briefly; and push back naturally when an answer does not resolve the issue.\n\nCALL POLICY:\n- Open naturally with: "Hi, I'm calling about [issue]." Then state the requested resolution in plain language.\n- Ask for the representative's name, case number, exact outcome, amount, method, and timing when relevant.\n- Answer only from CASE FACTS. If a fact is missing, say you need to check with the customer. Never fabricate dates, evidence, prior promises, authentication answers, or legal rights.\n- During hold music, recordings, or silence, do not speak. Resume only when a human addresses you or asks a direct question.\n- If an IVR understands speech, use short routing phrases a caller would actually say, such as "billing," "representative," or "existing reservation." Do not claim you pressed a digit: dynamic outbound DTMF is not available in this deployment.\n- Never provide card data, passwords, one-time codes, government ID, or authentication answers not in CASE FACTS. Never make threats, legal claims, or agree to a release, waiver, settlement, or payment method.\n- Before accepting any offer outside acceptance_limit or authorized_actions, call request_customer_approval.\n- Call record_case_note for every case number, commitment, denial reason, amount, or follow-up date.`;
}
