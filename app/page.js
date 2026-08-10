'use client';

import { useEffect, useMemo, useState } from 'react';

const initialForm = { accessToken: '', customer_name: '', customer_phone: '', company: '', reservation_or_case_id: '', issue: '', requested_resolution: '', acceptance_limit: 'Do not accept an offer without customer approval', authorized_actions: 'Request a manager, Request a case number' };
const labelFor = (role) => role === 'monica' ? 'Monica' : 'Representative';
const prettyTime = (timestamp) => timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';

export default function Home() {
  const [form, setForm] = useState(initialForm);
  const [callSid, setCallSid] = useState('');
  const [call, setCall] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const headers = useMemo(() => ({ Authorization: `Bearer ${form.accessToken}`, 'Content-Type': 'application/json' }), [form.accessToken]);

  useEffect(() => {
    if (!callSid || !form.accessToken) return undefined;
    let active = true;
    const readCall = async () => {
      try {
        const response = await fetch(`/api/demo/calls/${encodeURIComponent(callSid)}`, { headers, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 401 ? 'The demo token is not valid.' : 'Unable to read this call yet.');
        const record = await response.json();
        if (active) setCall(record);
      } catch (fetchError) { if (active) setError(fetchError.message); }
    };
    void readCall();
    const timer = window.setInterval(readCall, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [callSid, headers, form.accessToken]);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const startCall = async (event) => {
    event.preventDefault(); setError(''); setStarting(true);
    try {
      const payload = { ...form, customer_phone: form.customer_phone.replace(/[\s()-]/g, ''), authorized_actions: form.authorized_actions.split(',').map((value) => value.trim()).filter(Boolean) };
      delete payload.accessToken;
      const response = await fetch('/api/demo/calls', { method: 'POST', headers, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to start the call.');
      setCallSid(result.call_sid); setCall({ status: result.status, transcript: [], follow_up: null });
    } catch (startError) { setError(startError.message); } finally { setStarting(false); }
  };
  const transcript = call?.transcript || [];
  const completed = call?.status === 'completed';

  return <main className="shell"><section className="hero"><p className="eyebrow">MONICA / LIVE CALL CONSOLE</p><h1>Make the call.<br /><em>See every turn.</em></h1><p className="intro">Start a consented customer-service call, watch the transcript fill in live, and leave with a customer-ready follow-up plan.</p></section><section className="workspace"><form className="call-form" onSubmit={startCall}><div className="panel-heading"><div><p className="step">01 / PREPARE</p><h2>Call brief</h2></div><span className="consent">Verified numbers only</span></div><label>Demo access token<input required type="password" name="accessToken" value={form.accessToken} onChange={update} placeholder="MONICA_ADMIN_TOKEN" /></label><div className="two-col"><label>Customer name<input required name="customer_name" value={form.customer_name} onChange={update} placeholder="Alex" /></label><label>Phone number<input required name="customer_phone" value={form.customer_phone} onChange={update} placeholder="+14155550100" /></label></div><div className="two-col"><label>Company<input required name="company" value={form.company} onChange={update} placeholder="Hotel A" /></label><label>Reservation or case ID<input name="reservation_or_case_id" value={form.reservation_or_case_id} onChange={update} placeholder="ABC123" /></label></div><label>What happened?<textarea required name="issue" value={form.issue} onChange={update} placeholder="Pests in the room and no resolution from support." /></label><label>Requested resolution<textarea required name="requested_resolution" value={form.requested_resolution} onChange={update} placeholder="A partial refund." /></label><label>Acceptance limit<input required name="acceptance_limit" value={form.acceptance_limit} onChange={update} /></label><label>Authorized actions <span>comma-separated</span><input name="authorized_actions" value={form.authorized_actions} onChange={update} /></label><button disabled={starting} type="submit">{starting ? 'Starting call…' : 'Call this number'} <span>↗</span></button>{error && <p className="error" role="alert">{error}</p>}</form><section className="live-panel" aria-live="polite"><div className="panel-heading"><div><p className="step">02 / OBSERVE</p><h2>Live call history</h2></div><span className={`status ${call?.status || 'idle'}`}><i /> {call?.status || 'ready'}</span></div>{!callSid ? <div className="empty"><div className="wave">⌁</div><h3>Waiting for a call</h3><p>The conversation will appear here once the recipient answers.</p></div> : <><div className="call-id"><span>CALL ID</span><code>{callSid}</code></div><div className="transcript">{transcript.length === 0 && <p className="muted">Connecting to the call…</p>}{transcript.map((turn, index) => <article className={`turn ${turn.role}`} key={`${turn.item_id || index}-${turn.at}`}><div className="turn-meta"><strong>{labelFor(turn.role)}</strong><time>{prettyTime(turn.at)}</time></div><p>{turn.text}</p></article>)}</div>{completed && <FollowUp followUp={call.follow_up} />}</>}</section></section></main>;
}

function FollowUp({ followUp }) {
  if (!followUp) return <section className="follow-up"><p className="step">03 / FOLLOW UP</p><h3>Call complete</h3><p>No structured follow-up was recorded for this call.</p></section>;
  return <section className="follow-up"><p className="step">03 / FOLLOW UP</p><h3>{followUp.outcome || 'Call complete'}</h3>{followUp.customer_questions?.length > 0 && <><h4>What Monica needs from you</h4><ul>{followUp.customer_questions.map((question) => <li key={question}>{question}</li>)}</ul></>}<p><strong>Next:</strong> {followUp.next_step || 'Review the transcript and decide whether to follow up.'}</p></section>;
}
