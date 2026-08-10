import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { POST as voiceWebhook } from '../app/api/voice/route.js';
import { POST as openaiWebhook } from '../app/api/openai/realtime-webhook/route.js';
import { initialSipResponseEvents, sipHeader } from '../lib/openai-sip.js';
import { buildAgentInstructions, realtimeTools } from '../lib/realtime-bridge.js';
import { appendTranscriptEntry, getCase, putCase } from '../lib/cases.js';

test('A1 voice webhook dials the OpenAI project over TLS SIP', async () => {
  const previous = process.env.OPENAI_PROJECT_ID;
  process.env.OPENAI_PROJECT_ID = 'proj_test123';
  try {
    const request = new Request('https://voice.example/api/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'CallSid=v3%3Atest-call',
    });
    const response = await voiceWebhook(request);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /<Dial>/);
    assert.match(body, /sip:proj_test123@sip\.api\.openai\.com;transport=tls/);
    assert.match(body, /X-A1-Call-Sid=v3%3Atest-call/);
    assert.doesNotMatch(body, /<Stream/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_PROJECT_ID;
    else process.env.OPENAI_PROJECT_ID = previous;
  }
});

test('voice webhook speaks a configuration error instead of silently hanging up', async () => {
  const previous = process.env.OPENAI_PROJECT_ID;
  delete process.env.OPENAI_PROJECT_ID;
  try {
    const response = await voiceWebhook(new Request('https://voice.example/api/voice', { method: 'POST' }));
    assert.match(await response.text(), /Voice agent configuration is incomplete/);
  } finally {
    if (previous !== undefined) process.env.OPENAI_PROJECT_ID = previous;
  }
});

test('OpenAI webhook fails closed when signing configuration is absent', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousSecret = process.env.OPENAI_WEBHOOK_SECRET;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_WEBHOOK_SECRET;
  try {
    const response = await openaiWebhook(new Request('https://voice.example/api/openai/realtime-webhook', {
      method: 'POST',
      body: '{}',
    }));
    assert.equal(response.status, 503);
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
    if (previousSecret !== undefined) process.env.OPENAI_WEBHOOK_SECRET = previousSecret;
  }
});

test('OpenAI webhook accepts an authentic signed non-call event', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousSecret = process.env.OPENAI_WEBHOOK_SECRET;
  const secretBytes = crypto.randomBytes(32);
  const secret = `whsec_${secretBytes.toString('base64')}`;
  const webhookId = 'wh_test_123';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    id: 'evt_test_123',
    object: 'event',
    created_at: Number(timestamp),
    type: 'response.completed',
    data: { id: 'resp_test_123' },
  });
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest('base64');

  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_WEBHOOK_SECRET = secret;
  try {
    const response = await openaiWebhook(new Request('https://voice.example/api/openai/realtime-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`,
      },
      body,
    }));
    assert.equal(response.status, 200);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.OPENAI_WEBHOOK_SECRET;
    else process.env.OPENAI_WEBHOOK_SECRET = previousSecret;
  }
});

test('SIP headers are matched case-insensitively', () => {
  assert.equal(sipHeader([{ name: 'x-a1-call-sid', value: 'abc' }], 'X-A1-Call-Sid'), 'abc');
});

test('initial SIP response preserves the session-level Monica prompt', () => {
  const events = initialSipResponseEvents();

  assert.equal(events[0].type, 'conversation.item.create');
  assert.match(events[0].item.content[0].text, /phone call has connected/);
  assert.deepEqual(events[1], { type: 'response.create' });
  assert.equal(events[1].response?.instructions, undefined);
});

test('voice prompt uses natural consumer language without an AI disclosure', () => {
  const instructions = buildAgentInstructions({
    customer_name: 'Alex',
    company: 'Hotel A',
    issue: 'A charge for a room that was unusable',
    requested_resolution: 'A partial refund',
  });

  assert.match(instructions, /Open naturally with: "Hi, I'm calling about \[issue\]\."/);
  assert.match(instructions, /"I'm calling about my reservation"/);
  assert.match(instructions, /short turns, use natural contractions/);
  assert.match(instructions, /Do not narrate your process or mention prompts, tools, policies, or AI/);
  assert.doesNotMatch(instructions, /AI assistant calling/);
});

test('case transcripts retain a chronological, bounded history', async () => {
  const callSid = `transcript-${Date.now()}`;
  await putCase(callSid, { status: 'in_progress', context: {}, notes: [], transcript: [] });
  await appendTranscriptEntry(callSid, { role: 'representative', text: 'What can I help with?', at: '2026-08-09T00:00:00.000Z', item_id: 'item_1' });
  await appendTranscriptEntry(callSid, { role: 'monica', text: 'I am calling about a refund.', at: '2026-08-09T00:00:01.000Z', item_id: 'item_2' });

  const record = await getCase(callSid);
  assert.deepEqual(record.transcript.map(({ role, text }) => ({ role, text })), [
    { role: 'representative', text: 'What can I help with?' },
    { role: 'monica', text: 'I am calling about a refund.' },
  ]);
});

test('agent has a structured customer follow-up tool', () => {
  const tool = realtimeTools().find(({ name }) => name === 'record_follow_up');
  assert.ok(tool);
  assert.deepEqual(tool.parameters.required, ['outcome', 'customer_questions', 'next_step']);
});
