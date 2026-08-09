import WebSocket from 'ws';
import { fallbackCaseContext } from '../lib/config.js';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');

const context = fallbackCaseContext();
const instructions = `You are Monica, an AI customer-service advocate. You are not the customer and never pretend to be one. Use only these authorized case facts: ${JSON.stringify(context)}. Open by identifying yourself as an AI calling with the customer's permission. Be concise and helpful. Do not provide credentials, one-time codes, payment-card data, or make commitments beyond the case facts.`;

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
