import WebSocket from 'ws';
import { fallbackCaseContext } from './config.js';
import { getCase, putCase, updateCase } from './cases.js';
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

export async function acceptSipCall(callId, caseContext) {
  await openaiCallAction(callId, 'accept', {
    type: 'realtime',
    model: 'gpt-realtime-2.1',
    output_modalities: ['audio'],
    instructions: buildAgentInstructions(caseContext),
    audio: {
      input: {
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'auto',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: 'marin' },
    },
    tools: realtimeTools(),
  });
}

export async function prepareSipCase(caseId) {
  const existing = await getCase(caseId);
  const record = existing || {
    status: 'in_progress',
    context: fallbackCaseContext(),
    notes: [],
    approval: null,
    updated_at: new Date().toISOString(),
  };
  record.status = 'in_progress';
  record.updated_at = new Date().toISOString();
  await putCase(caseId, record);
  return record;
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
  };
  activeCalls.set(callId, state);

  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  };

  socket.on('open', () => {
    console.log('Monitoring OpenAI SIP call', callId);
    send({
      type: 'response.create',
      response: {
        instructions: 'The call has just connected. Begin speaking now with the required AI disclosure, then state why you are calling. Do not wait for the other person to speak first.',
      },
    });
  });

  socket.on('message', async (message) => {
    let event;
    try { event = JSON.parse(message.toString()); } catch { return; }

    try {
      if (event.type === 'response.function_call_arguments.done') {
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
