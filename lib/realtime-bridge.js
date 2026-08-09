import crypto from 'node:crypto';
import WebSocket from 'ws';
import { fallbackCaseContext } from './config.js';
import { getCase, putCase, updateCase } from './cases.js';

export function bridgeMedia(telnyxSocket) {
  console.log('A1 media bridge attached.');
  let openaiSocket;
  let closed = false;
  let started = false;
  let call = { sid: 'unknown', from: 'unknown' };
  let caseRecord;

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

  const connectOpenAI = () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
    const safetyIdentifier = crypto.createHash('sha256').update(call.from).digest('hex');
    openaiSocket = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': safetyIdentifier },
    });
    openaiSocket.on('open', () => {
      console.log('OpenAI Realtime connected for call', call.sid);
      sendOpenAI({ type: 'session.update', session: { type: 'realtime', output_modalities: ['audio'], instructions: instructions(caseRecord.context), audio: { input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true } }, output: { format: { type: 'audio/pcmu' }, voice: 'marin' } }, tools: tools() } });
      sendOpenAI({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'The phone call has connected. Begin with the required disclosure and explain why you are calling.' }] } });
      sendOpenAI({ type: 'response.create' });
    });
    openaiSocket.on('message', async (message) => {
      let event; try { event = JSON.parse(message.toString()); } catch { return; }
      if (event.type === 'response.output_audio.delta') sendTelnyx({ event: 'media', media: { payload: event.delta } });
      if (event.type === 'input_audio_buffer.speech_started') sendTelnyx({ event: 'clear' });
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
      output = { approved: false, message: 'Customer approval is not available in this call. Tell the representative you need to consult the customer and request a case number and callback window.' };
    } else if (event.name === 'end_call') {
      caseRecord = await updateCase(call.sid, (current) => ({ ...current, status: 'completed', updated_at: new Date().toISOString() })) || caseRecord;
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
        caseRecord = await getCase(call.sid) || { status: 'in_progress', context: fallbackCaseContext(), notes: [], approval: null, updated_at: new Date().toISOString() };
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

function tools() {
  return [
    { type: 'function', name: 'record_case_note', description: 'Record a concise factual outcome, case number, promise, or follow-up date.', parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false } },
    { type: 'function', name: 'request_customer_approval', description: 'Use before accepting money, credits, waivers, settlement terms, or commitments outside the authorized case boundary.', parameters: { type: 'object', properties: { proposal: { type: 'string' }, reason: { type: 'string' } }, required: ['proposal', 'reason'], additionalProperties: false } },
    { type: 'function', name: 'end_call', description: 'End only after recording a clear outcome, callback plan, or a representative request.', parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false } },
  ];
}

function instructions(caseContext) {
  return `You are Monica, an AI customer-service advocate calling on behalf of a customer who authorized this exact case. You are not the customer and never pretend to be one.\n\nCASE FACTS (the only facts you may assert):\n${JSON.stringify(caseContext)}\n\nCALL POLICY:\n- Open with: "Hi, I’m Monica, an AI assistant calling on behalf of [customer name], with their permission." State the issue and requested resolution.\n- Be calm, concise, persistent, and cooperative. Ask for a representative name, case number, exact outcome, amount, method, and timing.\n- Answer only from CASE FACTS. If a fact is missing, say you need to confirm it with the customer. Never fabricate dates, evidence, prior promises, or legal rights.\n- During hold music, recordings, or silence, do not speak. Resume only when a human addresses you or a direct question is asked.\n- If an IVR understands speech, use short spoken routing phrases. Do not claim you pressed a digit: dynamic outbound DTMF is not available in this deployment.\n- Never provide card data, passwords, one-time codes, government ID, or authentication answers not in CASE FACTS. Never make threats, legal claims, or agree to a release, waiver, settlement, or payment method.\n- Before accepting any offer outside acceptance_limit or authorized_actions, call request_customer_approval.\n- Call record_case_note for every case number, commitment, denial reason, amount, or follow-up date.`;
}
