import './scenarios.css';
import { getCase } from '../lib/cases.js';

const scenarios = {
  hotel_refund: { label: 'Hotel refund', customer_name: 'Alex', company: 'Hotel A', issue: 'The room was unusable and the hotel has not resolved the complaint.', requested_resolution: 'A partial refund.' },
  billing_dispute: { label: 'Billing dispute', customer_name: 'Alex', company: 'Example Telecom', issue: 'There is an unexpected charge on the latest bill.', requested_resolution: 'Review and reverse the incorrect charge.' },
  insurance_claim: { label: 'Insurance claim', customer_name: 'Alex', company: 'Example Insurance', issue: 'A claim was denied without a clear explanation.', requested_resolution: 'Explain the denial and reopen the claim for review.' },
};

const blank = { customer_name: '', customer_phone: '+16283330752', company: '', reservation_or_case_id: '', issue: '', requested_resolution: '', acceptance_limit: 'Do not accept an offer without customer approval' };

export default async function Home({ searchParams }) {
  const query = await searchParams;
  const form = { ...blank, ...(scenarios[query.scenario] || {}) };
  const call = query.call_sid ? await getCase(query.call_sid) : null;
  const active = call && !['completed', 'approval_required'].includes(call.status);

  return <main className="shell">
    {active && <meta httpEquiv="refresh" content={`2;url=/?call_sid=${encodeURIComponent(query.call_sid)}`} />}
    <section className="hero"><p className="eyebrow">MONICA / LIVE CALL CONSOLE</p><h1>Make the call.<br /><em>See every turn.</em></h1><p className="intro">Start a consented customer-service call, watch the transcript fill in live, and leave with a customer-ready follow-up plan.</p></section>
    <section className="workspace">
      <form className="call-form" action="/api/demo/calls" method="post">
        <div className="panel-heading"><div><p className="step">01 / PREPARE</p><h2>Call brief</h2></div><span className="consent">Verified numbers only</span></div>
        <fieldset className="scenario-picker"><legend>Start from a scenario</legend><div>{Object.entries(scenarios).map(([key, scenario]) => <a className="scenario" key={key} href={`/?scenario=${key}`}>{scenario.label}</a>)}</div></fieldset>
        <div className="two-col"><label>Customer name<input required name="customer_name" defaultValue={form.customer_name} placeholder="Alex" /></label><label>Phone number<input required name="customer_phone" defaultValue={form.customer_phone} /></label></div>
        <div className="two-col"><label>Company<input required name="company" defaultValue={form.company} placeholder="Hotel A" /></label><label>Reservation or case ID<input name="reservation_or_case_id" defaultValue={form.reservation_or_case_id} placeholder="ABC123" /></label></div>
        <label>What happened?<textarea required name="issue" defaultValue={form.issue} /></label>
        <label>Requested resolution<textarea required name="requested_resolution" defaultValue={form.requested_resolution} /></label>
        <label>Acceptance limit<input required name="acceptance_limit" defaultValue={form.acceptance_limit} /></label>
        <button type="submit">Call this number <span>↗</span></button>
        {query.error && <p className="error" role="alert">{query.error}</p>}
      </form>
      <History call={call} callSid={query.call_sid} />
    </section>
  </main>;
}

function History({ call, callSid }) {
  const transcript = call?.transcript || [];
  const state = call?.status || 'ready';
  return <section className="live-panel" aria-live="polite">
    <div className="panel-heading"><div><p className="step">02 / OBSERVE</p><h2>Live call history</h2></div><span className={`status ${state}`}><i /> {state}</span></div>
    {!callSid ? <div className="empty"><div className="wave">⌁</div><h3>Waiting for a call</h3><p>The conversation will appear here once the recipient answers.</p></div> : !call ? <div className="empty"><h3>Call not found</h3><p>This saved call history is no longer available.</p></div> : <><div className="call-id"><span>CALL ID</span><code>{callSid}</code></div><div className="transcript">{transcript.length === 0 && <p className="muted">Connecting to the call…</p>}{transcript.map((turn, index) => <article className={`turn ${turn.role}`} key={`${turn.item_id || index}-${turn.at}`}><div className="turn-meta"><strong>{turn.role === 'monica' ? 'Monica' : 'Representative'}</strong><time>{turn.at ? new Date(turn.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''}</time></div><p>{turn.text}</p></article>)}</div>{state === 'completed' && <FollowUp followUp={call.follow_up} />}</>}
  </section>;
}

function FollowUp({ followUp }) {
  if (!followUp) return <section className="follow-up"><p className="step">03 / FOLLOW UP</p><h3>Call complete</h3><p>No structured follow-up was recorded for this call.</p></section>;
  return <section className="follow-up"><p className="step">03 / FOLLOW UP</p><h3>{followUp.outcome || 'Call complete'}</h3>{followUp.customer_questions?.length > 0 && <><h4>What Monica needs from you</h4><ul>{followUp.customer_questions.map((question) => <li key={question}>{question}</li>)}</ul></>}<p><strong>Next:</strong> {followUp.next_step || 'Review the transcript and decide whether to follow up.'}</p></section>;
}
