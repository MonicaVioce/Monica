import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { POST as voiceWebhook } from '../app/api/voice/route.js';
import { POST as openaiWebhook } from '../app/api/openai/realtime-webhook/route.js';
import { sipHeader } from '../lib/openai-sip.js';

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
