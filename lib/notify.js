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

function composeUpdate(caseRecord, kind) {
  const context = caseRecord?.context || {};
  const company = context.company || 'the company';
  if (kind === 'approval_required') {
    const approval = caseRecord?.approval || {};
    return `Monica here 💅 ${company} made an offer that needs your OK: ${approval.proposal || 'see case notes'}${approval.reason ? ` (${approval.reason})` : ''}. I told them I have to check with you first and asked for a case number.`;
  }
  const notes = (caseRecord?.notes || []).slice(-3).map((note) => note.text).join(' · ');
  return `Monica here 💅 Just hung up with ${company} about "${context.issue || 'your case'}". ${notes || 'No clear outcome was recorded — I will schedule a follow-up call.'}`;
}

// Fire-and-forget case update to the customer's phone. Never throws: a failed
// text must not break the live call, so failures only log.
export async function notifyCase(caseRecord, kind) {
  const to = caseRecord?.context?.customer_phone;
  if (!to) return console.log(`notifyCase skipped (${kind}): no customer_phone in case context.`);
  if (!process.env.A1_TEAM_KEY) return console.log(`notifyCase skipped (${kind}): A1_TEAM_KEY not set.`);
  try {
    const result = await sendSms(to, composeUpdate(caseRecord, kind).slice(0, 1000));
    console.log(`Case update SMS sent (${kind}) to ${to}:`, result.message_id);
  } catch (error) {
    console.error(`notifyCase failed (${kind}):`, error.message);
  }
}
