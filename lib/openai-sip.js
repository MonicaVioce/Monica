import WebSocket from 'ws';
import { fallbackCaseContext } from './config.js';
import { appendTranscriptEntry, getCase, putCase, updateCase } from './cases.js';
import { buildAgentInstructions, realtimeTools } from './realtime-bridge.js';

const activeCalls = globalThis.__monicaSipCalls || new Map();
globalThis.__monicaSipCalls = activeCalls;

function authHeaders() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function openaiCallAction(callId, action, body) {
  const response = await fetch(
    `https://api.openai.com/v1/realtime/calls/${encodeURIComponent(callId)}/${action}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Error(`OpenAI Realtime call ${action} failed with HTTP ${response.status}.`);
  }
}

export function sipSessionConfig(caseContext) {
  return {
    type: 'realtime',
    model: 'gpt-realtime-2.1',
    output_modalities: ['audio'],
    instructions: buildAgentInstructions(caseContext),
    audio: {
      // A1/Telnyx calls use G.711 μ-law. Explicitly setting both directions
      // prevents the default PCM output from being negotiated as silent audio.
      input: {
        format: { type: 'audio/pcmu' },
        transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'low',
          create_response: true,
          // Phone lines often report speech/noise during an opening. Do not
          // truncate Monica's response before the other party can hear it.
          interrupt_response: false,
        },
      },
      output: { format: { type: 'audio/pcmu' }, voice: 'marin' },
    },
    tools: realtimeTools(),
  };
}

export async function acceptSipCall(callId, caseContext) {
  await openaiCallAction(callId, 'accept', sipSessionConfig(caseContext));
}

export async function prepareSipCase(caseId) {
  const existing = await getCase(caseId);
  const record = existing || {
    status: 'in_progress',
    context: fallbackCaseContext(),
    notes: [],
    transcript: [],
    follow_up: null,
    approval: null,
    updated_at: new Date().toISOString(),
  };
  record.status = 'in_progress';
  record.updated_at = new Date().toISOString();
  await putCase(caseId, record);
  return record;
}

export function initialSipResponseEvents() {
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: 'The phone call has connected. Begin speaking now by stating why you are calling. Do not wait for the other person to speak first.',
        }],
      },
    },
    { type: 'response.create' },
  ];
}

export function monitorSipCall(callId, caseId, initialCaseRecord) {
  if (activeCalls.has(callId)) return;

  const socket = new WebSocket(
    `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`,
    { headers: { Authorization: authHeaders().Authorization } },
  );
  const state = {
    socket,
    caseRecord: initialCaseRecord,
    caseId,
    ending: false,
    hangupAfterResponseId: null,
    seenTranscriptItems: new Set(),
    transcriptWrite: Promise.resolve(),
  };
  activeCalls.set(callId, state);

  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };
  const saveTranscript = (role, text, itemId) => {
    const normalized = String(text || '').trim();
    const dedupeKey = `${role}:${itemId || normalized}`;
    if (!normalized || state.seenTranscriptItems.has(dedupeKey)) return;
    state.seenTranscriptItems.add(dedupeKey);
    state.transcriptWrite = state.transcriptWrite
      .then(async () => {
        const entry = { role, text: normalized.slice(0, 4000), at: new Date().toISOString(), item_id: itemId || null };
        state.caseRecord = await appendTranscriptEntry(state.caseId, entry) || state.caseRecord;
      })
      .catch((error) => console.error('Could not save call transcript:', error.message));
  };

  socket.on('open', () => {
    console.log('Monitoring OpenAI SIP call', callId);
    for (const event of initialSipResponseEvents()) send(event);
  });

  socket.on('message', async (message) => {
    let event;
    try { event = JSON.parse(message.toString()); } catch { return; }

    try {
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        saveTranscript('representative', event.transcript, event.item_id);
      } else if (event.type === 'response.output_audio_transcript.done') {
        saveTranscript('monica', event.transcript, event.item_id);
      } else if (event.type === 'response.function_call_arguments.done') {
        await handleToolCall(callId, state, event, send);
      } else if (event.type === 'response.created' && state.ending && !state.hangupAfterResponseId) {
        state.hangupAfterResponseId = event.response?.id || null;
      } else if (event.type === 'response.done' && event.response?.id === state.hangupAfterResponseId) {
        await openaiCallAction(callId, 'hangup');
      } else if (event.type === 'error') {
        console.error('OpenAI SIP Realtime error:', event.error?.message || event.type);
      }
    } catch (error) {
      console.error('OpenAI SIP event handler failed:', error.message);
    }
  });

  socket.on('close', (code, reason) => {
    console.log('OpenAI SIP monitor closed:', callId, code, reason.toString());
    activeCalls.delete(callId);
  });
  socket.on('error', (error) => {
    console.error('OpenAI SIP monitor error:', callId, error.message);
  });
}

async function handleToolCall(callId, state, event, send) {
  let args = {};
  try { args = JSON.parse(event.arguments || '{}'); } catch { /* use empty args */ }

  let output;
  if (event.name === 'record_case_note') {
    const note = String(args.note || '').slice(0, 1000);
    state.caseRecord = await updateCase(state.caseId, (current) => ({
      ...current,
      notes: [...current.notes, { text: note, at: new Date().toISOString() }],
      updated_at: new Date().toISOString(),
    })) || state.caseRecord;
    output = { recorded: true, note };
  } else if (event.name === 'request_customer_approval') {
    const approval = {
      proposal: String(args.proposal || ''),
      reason: String(args.reason || ''),
      requested_at: new Date().toISOString(),
    };
    state.caseRecord = await updateCase(state.caseId, (current) => ({
      ...current,
      status: 'approval_required',
      approval,
      updated_at: new Date().toISOString(),
    })) || state.caseRecord;
    output = {
      approved: false,
      message: 'Customer approval is not available in this call. Ask for a case number and callback window.',
    };
  } else if (event.name === 'record_follow_up') {
    const followUp = {
      outcome: String(args.outcome || '').slice(0, 1000),
      customer_questions: Array.isArray(args.customer_questions)
        ? args.customer_questions.map((question) => String(question).slice(0, 500)).slice(0, 10)
        : [],
      next_step: String(args.next_step || '').slice(0, 1000),
      recorded_at: new Date().toISOString(),
    };
    state.caseRecord = await updateCase(state.caseId, (current) => ({
      ...current,
      follow_up: followUp,
      updated_at: new Date().toISOString(),
    })) || state.caseRecord;
    output = { recorded: true, follow_up: followUp };
  } else if (event.name === 'end_call') {
    state.caseRecord = await updateCase(state.caseId, (current) => ({
      ...current,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })) || state.caseRecord;
    state.ending = true;
    output = { ending: true };
  } else {
    output = { error: 'Unknown tool.' };
  }

  send({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: event.call_id,
      output: JSON.stringify(output),
    },
  });
  send({ type: 'response.create' });
}

export function sipHeader(headers, name) {
  const header = headers?.find((item) => item?.name?.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}
