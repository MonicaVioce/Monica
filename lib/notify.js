const A1_BASE = 'https://hack.a1mobile.com';

export async function sendSms(to, body) {
  const teamKey = process.env.A1_TEAM_KEY;
  if (!teamKey) throw new Error('A1_TEAM_KEY is not set.');
  const response = await fetch(`${A1_BASE}/api/sms`, {
    method: 'POST',
    headers: { 'X-Team-Key': teamKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.sent !== true) throw new Error(`SMS send failed (${response.status}): ${result.detail || JSON.stringify(result)}`);
  return result;
}

// Blue-bubble path: a Mac running scripts/imessage-bridge.mjs (see docs/monica-identity.md).
async function sendIMessage(to, body) {
  const base = process.env.IMESSAGE_BRIDGE_URL;
  if (!base) throw new Error('IMESSAGE_BRIDGE_URL is not set.');
  const response = await fetch(`${base.replace(/\/$/, '')}/imessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, body }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.sent !== true) throw new Error(`iMessage send failed (${response.status}): ${result.error || 'unknown'}`);
  return result;
}

// Prefer iMessage when a bridge is configured; fall back to SMS so a dead
// bridge can never lose a customer update.
export async function sendMessage(to, body) {
  if (process.env.IMESSAGE_BRIDGE_URL) {
    try { return { ...(await sendIMessage(to, body)), channel: 'imessage' }; }
    catch (error) { console.error('iMessage failed, falling back to SMS:', error.message); }
  }
  return { ...(await sendSms(to, body)), channel: 'sms' };
}

function composeUpdate(caseRecord, kind) {
  const context = caseRecord?.context || {};
  const company = context.company || 'the company';
  if (kind === 'approval_required') {
    const approval = caseRecord?.approval || {};
    return `Monica here 💅 ${company} made an offer that needs your OK: ${approval.proposal || 'see case notes'}${approval.reason ? ` (${approval.reason})` : ''}. I told them I have to check with you first and asked for a case number.`;
  }
  const followUp = caseRecord?.follow_up;
  if (followUp) {
    const questions = (followUp.customer_questions || []).filter(Boolean);
    return `Monica here 💅 Just hung up with ${company}. ${followUp.outcome || 'The call is complete.'}${questions.length ? ` I need from you: ${questions.join(' ')}` : ''}${followUp.next_step ? ` Next: ${followUp.next_step}` : ''}`;
  }
  const notes = (caseRecord?.notes || []).slice(-3).map((note) => note.text).join(' · ');
  return `Monica here 💅 Just hung up with ${company} about "${context.issue || 'your case'}". ${notes || 'No clear outcome was recorded — I will schedule a follow-up call.'}`;
}

// Fire-and-forget case update to the customer's phone. Never throws: a failed
// text must not break the live call, so failures only log.
export async function notifyCase(caseRecord, kind) {
  const to = caseRecord?.context?.customer_phone;
  if (!to) return console.log(`notifyCase skipped (${kind}): no customer_phone in case context.`);
  if (!process.env.A1_TEAM_KEY && !process.env.IMESSAGE_BRIDGE_URL) return console.log(`notifyCase skipped (${kind}): no A1_TEAM_KEY or IMESSAGE_BRIDGE_URL.`);
  try {
    const result = await sendMessage(to, composeUpdate(caseRecord, kind).slice(0, 1000));
    console.log(`Case update sent (${kind}, ${result.channel}) to ${to}:`, result.message_id || 'ok');
  } catch (error) {
    console.error(`notifyCase failed (${kind}):`, error.message);
  }
}
