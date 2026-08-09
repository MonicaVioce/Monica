# SMS notification leg — how Monica texts you the result

This is the last hop of the flow: the call ends → the orchestrator texts the user the
outcome. It works today (verified live on 2026-08-09). This doc explains the API calls
and what actually happens underneath.

## TL;DR — three calls

```bash
# 1. One-time per recipient: request consent (OTP lands on their phone)
curl -X POST https://hack.a1mobile.com/api/verified-numbers \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"phone":"+1XXXXXXXXXX"}'

# 2. One-time per recipient: confirm with the code they received
curl -X POST https://hack.a1mobile.com/api/verified-numbers/confirm \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"phone":"+1XXXXXXXXXX","code":"123456"}'

# 3. From now on, send freely
curl -X POST https://hack.a1mobile.com/api/sms \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"to":"+1XXXXXXXXXX","body":"Refund approved 🎉 $200, 5-7 business days."}'
```

Or use the wrapper scripts: [`scripts/verify-number.sh`](../scripts/verify-number.sh)
and [`scripts/notify.sh`](../scripts/notify.sh).

## The chain, layer by layer

```
our code ──HTTP──▶ a1mobile ──API──▶ Telnyx (CPaaS) ──SMPP──▶ carrier SMSC ──▶ user's phone
```

1. **a1mobile (hackathon platform)** — a thin multi-tenant wrapper. It maps
   `X-Team-Key` → our provisioned number (that's why there's no `from` field in the
   request), enforces the consent allowlist, and forwards to Telnyx.
2. **Consent / OTP allowlist** — A2P (application-to-person) messaging is regulated
   (TCPA, carrier anti-spam). The platform's rule: you can only call/text numbers that
   have proven consent. Proof = the OTP round-trip: whoever can read back the code
   controls that phone. Verification is **permanent per number** — steps 1–2 never
   repeat for the same recipient.
3. **Telnyx (CPaaS)** — owns the actual phone number (a DID), holds carrier
   interconnects, and translates the HTTP call into SMPP toward the carrier network.
4. **Carrier SMSC** — store-and-forward queue. Phone off? It waits. This is why SMS is
   sometimes minutes late; there's a queue in the middle, not a socket.

## Two gotchas we hit live

- `{"sent":true}` means **accepted by the platform**, not **delivered to the phone**.
  Delivery receipts (DLRs) come back asynchronously; correlate by `message_id` if we
  ever need delivery status.
- The OTP is **6 digits**. A 7-digit read-off gets `verification code rejected`; just
  re-check the SMS, the code stays valid until it expires.

## Inbound (if we ever want replies)

Register a webhook (`POST /api/sms/webhook`) or poll `GET /api/sms/inbound?since_id=N`.
Webhook relays are signed: `X-A1-Signature = HMAC-SHA256(raw_body, team_key)`.
Verify by recomputing over the **raw request bytes** (not re-serialized JSON — key
order changes break the digest) and compare with a constant-time equality function.

## Same number, two capabilities

Our number does SMS (this doc) **and** voice: by default inbound calls ring the SIP
trunk creds (`sip.telnyx.com`); after `POST /api/numbers/point` the platform streams
calls to our voice webhook instead, and `POST /api/calls` places outbound calls that
run the same webhook on answer. That's the voice-agent leg of the architecture.

## Credentials

Everything reads `A1_TEAM_KEY` from the environment — see [`.env.example`](../.env.example).
Never commit the real key (it's the full API credential for calls, SMS, and MCP).
