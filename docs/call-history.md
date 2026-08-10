# Call history, transcripts, and follow-up integration

This guide explains what Monica saves for each phone call, how another service
can read it, and where recordings fit into the architecture.

## What is stored

Every call has a case record keyed by the A1 `call_sid`. The case record is the
source of truth for the call lifecycle:

```json
{
  "status": "completed",
  "context": {
    "customer_name": "Alex",
    "customer_phone": "+14155550100",
    "company": "Hotel A",
    "issue": "Pests in the room",
    "requested_resolution": "A partial refund"
  },
  "notes": [{ "text": "Representative offered $100 credit", "at": "..." }],
  "transcript": [
    { "role": "monica", "text": "Hi, I'm calling about...", "at": "...", "item_id": "..." },
    { "role": "representative", "text": "How can I help?", "at": "...", "item_id": "..." }
  ],
  "follow_up": {
    "outcome": "The hotel needs to review the case.",
    "customer_questions": ["Can you send the receipt?"],
    "next_step": "Monica should call back after the receipt is sent.",
    "recorded_at": "..."
  },
  "approval": null,
  "updated_at": "..."
}
```

`status` moves from `prepared` to `in_progress`, then normally to `completed`.
It can instead become `approval_required` when a representative makes an offer
that Monica is not allowed to accept on the customer's behalf.

## How the transcript is produced

1. A1 answers the outbound call and sends it to `/api/voice`.
2. That endpoint dials the OpenAI Realtime SIP endpoint.
3. OpenAI sends a signed `realtime.call.incoming` webhook to
   `/api/openai/realtime-webhook`.
4. Monica accepts the SIP call with input transcription enabled and opens a
   monitoring WebSocket.
5. The monitor saves each completed input-audio transcript as
   `representative`, and each completed output-audio transcript as `monica`.
6. When the call ends, Monica records a structured `follow_up` before ending
   the call.

The transcript is live: entries are appended while the call is in progress.
The latest 500 entries are retained per case. Speech recognition can make
mistakes, so treat the transcript as a useful operational record, not a
word-perfect legal record.

## Required setup

Configure these values in the environment used by the public Monica server:

```env
OPENAI_API_KEY=...
OPENAI_PROJECT_ID=proj_...
OPENAI_WEBHOOK_SECRET=whsec_...
A1_TEAM_KEY=team_...
PUBLIC_BASE_URL=https://monica.example.com
MONICA_ADMIN_TOKEN=a-long-random-secret
KV_REST_API_URL=...                 # recommended for durable records
KV_REST_API_TOKEN=...
```

Without the two `KV_REST_*` variables, the case store is in-memory only. That
is appropriate for a local demo but call history disappears when the process
restarts. Check the active storage mode at `GET /api/health`.

Configure an OpenAI project webhook for:

```text
https://monica.example.com/api/openai/realtime-webhook
```

Subscribe it to `realtime.call.incoming`. Point the A1 number at
`https://monica.example.com/api/voice`.

## Integrating a caller or orchestrator

The caller must only dial phone numbers that have completed A1 OTP verification
or are permitted test lines. Once a number is verified, create the call, keep
its `call_sid`, and attach the authorized case context immediately.

```bash
# 1. Start the call. Save call_sid from the JSON response.
curl -X POST https://hack.a1mobile.com/api/calls \
  -H "X-Team-Key: $A1_TEAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"+14155550100"}'

# 2. Attach case facts before the recipient answers.
curl -X PUT "https://monica.example.com/api/cases/$CALL_SID" \
  -H "Authorization: Bearer $MONICA_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name":"Alex",
    "customer_phone":"+14155550100",
    "company":"Hotel A",
    "reservation_or_case_id":"ABC123",
    "issue":"Pests in the room",
    "requested_resolution":"A partial refund",
    "acceptance_limit":"Do not accept an offer without customer approval",
    "authorized_actions":["Request a manager","Request a case number"]
  }'
```

`context` is intentionally constrained. It defines the facts Monica may state
on the call and is also used to route notifications to `customer_phone`.

## Reading the result

Use the authorized case endpoint during the call or after it completes:

```bash
curl "https://monica.example.com/api/cases/$CALL_SID" \
  -H "Authorization: Bearer $MONICA_ADMIN_TOKEN"
```

Recommended consumer behavior:

| Case state | Integration action |
| --- | --- |
| `prepared` | Wait for the call to connect. |
| `in_progress` | Poll or display newly appended `transcript` entries. |
| `approval_required` | Show `approval.proposal` and `approval.reason`; collect an explicit customer decision before a new call. |
| `completed` | Present `follow_up.outcome`, ask the customer every `follow_up.customer_questions`, then execute `follow_up.next_step`. |

The case endpoint is admin-protected because transcripts can contain sensitive
customer-service information. Do not expose `MONICA_ADMIN_TOKEN` in a browser
or mobile client. Put a user-authenticated backend in front of it and return
only the fields the signed-in user is allowed to see.

## Notifications

If `context.customer_phone` is present and verified, Monica sends a completion
update automatically. The message prefers the configured iMessage bridge and
falls back to A1 SMS. A structured `follow_up` is used when present; otherwise
the notification falls back to the latest case notes.

Use the API record as the canonical result even when notifications are enabled:
delivery can fail and mobile messages are deliberately short.

## Audio recordings: current boundary and integration options

The direct A1-to-OpenAI SIP deployment saves transcript text, not a retrievable
audio file. The Realtime monitor receives transcribed input/output events; it
does not receive a post-call recording URL.

If downloadable audio is a product requirement, choose one of these designs:

1. Enable compliant call recording at the telephony provider, then save the
   provider recording ID/URL on the case record.
2. Use Monica's media-bridge path and write the incoming and outgoing audio
   streams to private object storage, then associate the object key with the
   case.

For either option, implement recording disclosure/consent, access control,
encryption, retention, deletion, and jurisdiction-specific policy before
recording real customer-service calls. Keep recordings private; do not return a
public object-storage URL from the case API.

## Operational checklist

- Keep `OPENAI_WEBHOOK_SECRET`, `A1_TEAM_KEY`, and `MONICA_ADMIN_TOKEN` in a
  secret manager.
- Use Redis-backed storage for any environment where history matters.
- Persist the `call_sid` in your orchestration system immediately after dialing.
- Attach the case context immediately, before the called party answers.
- Treat transcript text as imperfect ASR and resolve ambiguous facts with the
  customer or representative.
- Read `follow_up` before sending a customer update or scheduling another call.
- Only call verified or otherwise consented numbers.
