import WebSocket from 'ws';
import { fallbackCaseContext } from '../lib/config.js';
import { buildAgentInstructions } from '../lib/realtime-bridge.js';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');

const context = fallbackCaseContext();
const hasUsableCaseContext = ['customer_name', 'company', 'issue', 'requested_resolution']
  .every((field) => typeof context[field] === 'string' && context[field].trim());
const testCaseContext = hasUsableCaseContext ? context : {
  customer_name: 'Alex',
  company: 'Hotel A',
  reservation_or_case_id: 'DEMO-123',
  issue: 'the room was unusable because of pests',
  requested_resolution: 'a partial refund',
  acceptance_limit: 'Do not accept an offer without customer approval',
  authorized_actions: ['Request a manager', 'Request a case number'],
};
const instructions = buildAgentInstructions(testCaseContext);

const socket = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1', {
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': 'monica-local-realtime-test' },
});

let turn = 0;
const transcripts = [];
const timeout = setTimeout(() => {
  console.error('Realtime test timed out.');
  socket.close();
  process.exitCode = 1;
}, 30_000);

function requestResponse(prompt) {
  socket.send(JSON.stringify({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] },
  }));
  socket.send(JSON.stringify({ type: 'response.create' }));
}

socket.on('open', () => {
  socket.send(JSON.stringify({
    type: 'session.update',
    session: {
      type: 'realtime',
      output_modalities: ['audio'],
      instructions,
      audio: {
        input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true } },
        output: { format: { type: 'audio/pcmu' }, voice: 'marin' },
      },
    },
  }));
});

socket.on('message', (message) => {
  const event = JSON.parse(message.toString());
  if (event.type === 'error') {
    console.error('Realtime error:', event.error?.message || event);
    socket.close();
    process.exitCode = 1;
    return;
  }
  if (event.type === 'session.updated') {
    requestResponse('The call has connected. Introduce yourself and state the reason for the call.');
  }
  if (event.type === 'response.output_audio_transcript.done') transcripts.push(event.transcript);
  if (event.type === 'response.done') {
    turn += 1;
    if (turn === 1) {
      requestResponse('A representative says: "I can help. What outcome are you seeking?" Respond as Monica.');
    } else {
      console.log(JSON.stringify({ ok: true, turns: turn, transcripts }, null, 2));
      socket.close();
    }
  }
});

socket.on('error', (error) => {
  console.error('Realtime socket error:', error.message);
  process.exitCode = 1;
});

socket.on('close', () => clearTimeout(timeout));
