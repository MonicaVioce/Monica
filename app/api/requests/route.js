import crypto from 'node:crypto';

import { putCase } from '../../../lib/cases.js';
import { validateCaseContext } from '../../../lib/config.js';

export const runtime = 'nodejs';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return Response.json(body, { ...init, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Public intake only. Starting outbound calls and reading request details remain
// admin-only so an unauthenticated caller cannot spend telephony funds or access PII.
export async function POST(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 60_000) {
    return json({ error: 'Request body must be at most 60,000 bytes.' }, { status: 413 });
  }

  try {
    const context = validateCaseContext(await request.json());
    const requestId = `req_${crypto.randomUUID()}`;
    const submittedAt = new Date().toISOString();
    await putCase(requestId, {
      status: 'submitted',
      context,
      notes: [],
      transcript: [],
      follow_up: null,
      approval: null,
      submitted_at: submittedAt,
      updated_at: submittedAt,
    });

    return json({
      request_id: requestId,
      status: 'submitted',
      submitted_at: submittedAt,
    }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid request body.' }, { status: 400 });
  }
}
