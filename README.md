# Monica 📞

**Your AI big sis who yells at customer service so you don't have to.**

Ever called an insurance company 10 times to get a refund, and got denied every single time? So did we. That's why we built Monica — an AI voice agent that calls customer service on your behalf, argues your case, survives the hold music, and texts you the result.

> we made a website called **myinsurancecompanydidnotrefundmymoney.com** — Monica lives there.

## What Monica does

- **Takes your request over iMessage** — "get my refund from X", "book me a hotel", "ask if my insurance covers this"
- **Dials the company for you** — real outbound phone calls, not emails into the void
- **Chats fluently with human agents** — handles follow-up questions, pushback, and "let me transfer you"
- **Survives holds** — Monica waits on hold; you don't
- **Schedules follow-up calls** — if the agent says "call back tomorrow", Monica actually does
- **Reports back** — you get an iMessage with the outcome (refund approved 🎉 / denied, here's why, here's the next move)

## How it works

```
┌──────────┐   iMessage    ┌─────────────┐   VoiceOS routing   ┌──────────────┐
│   User   │ ────────────▶ │   Monica    │ ──────────────────▶ │ Voice Agent  │
│          │ ◀──────────── │ orchestrator│ ◀────────────────── │  (telephony) │
└──────────┘  call result  └─────────────┘    call outcome     └──────┬───────┘
                                                                      │ PSTN / SIP
                                                               ┌──────▼───────┐
                                                               │  Customer    │
                                                               │  service 😈  │
                                                               └──────────────┘
```

Three pieces:

1. **iMessage bridge** — receives user requests, pushes status updates and final results
2. **Voice agent** — LLM-driven conversation over a phone call (dial, talk, hold, hang up, schedule retries), routed through voiceOS
3. **Orchestrator** — connects the two: turns a text request into a call plan, turns a call transcript into a result message

Telephony runs on a SIP trunk / voice webhook (Telnyx-backed). Numbers must be OTP-verified before Monica can call or text them — no cold outreach, consent first.

## Setup

Credentials live in environment variables — **never commit them**:

```bash
cp .env.example .env
```

```env
A1_TEAM_KEY=team-xxxxxxxxxxxx        # your a1mobile team key
A1_PHONE_NUMBER=+1xxxxxxxxxx         # Monica's outbound number
SIP_USERNAME=xxxxxxxx                # SIP trunk creds (sip.telnyx.com)
SIP_PASSWORD=xxxxxxxx
```

Point the number's voice webhook at your server, then place calls:

```bash
# wire the number to your voice server
curl -X POST https://hack.a1mobile.com/api/numbers/point \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://YOUR-SERVER/voice"}'

# outbound call — your webhook drives the conversation on answer
curl -X POST https://hack.a1mobile.com/api/calls \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"to":"+1NUMBER"}'
```

## Demo

Everything happens in an iMessage thread:

1. Text Monica: *"my insurance denied my refund again, fight them"*
2. Monica calls the (mock) insurance company, argues the case, handles follow-ups
3. You get the play-by-play and the final verdict back in iMessage

## Roadmap

- [ ] Voice agent API research & integration
- [ ] iMessage API research & integration
- [ ] Infra connecting iMessage ↔ voice
- [ ] Mock agencies (insurance / hotel) for testing
- [ ] End-to-end integration + QA
- [ ] Demo video

Out of scope for now: receiving inbound call-backs from customer service.

---

*Built at a hackathon, fueled by refund-denial rage.*
