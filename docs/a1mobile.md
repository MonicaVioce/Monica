Monica
Save your team key — it's your API credential (and your MCP team_key).

Team key
team-f91e244317ab66ff
Phone number
+13463016959
SIP username
hackteam0006a920
SIP password
4e4f377d3f15f3acc00f4108
← create another

📚 Guides — numbers · texting · voice/TeXML · MCP

1. Claim your number
curl -X POST https://hack.a1mobile.com/api/numbers/claim -H "X-Team-Key: team-f91e244317ab66ff"
# -> {"phone_number":"+1...","sip_username":"...","sip_password":"..."}  (idempotent)
Wire it two ways:

Webhook (recommended) — point the number's voice webhook at your server; we stream the call to you (Pipecat / any server):
curl -X POST https://hack.a1mobile.com/api/numbers/point \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://YOUR-SERVER/voice"}'
SIP — register sip_username / sip_password at host sip.telnyx.com as a trunk (Vapi BYO SIP, LiveKit inbound trunk).
A number rings your SIP creds on claim and flips to webhook mode when you /point it. Check wiring, or revert to SIP:

curl https://hack.a1mobile.com/api/numbers/me -H "X-Team-Key: team-f91e244317ab66ff"
curl -X POST https://hack.a1mobile.com/api/numbers/unpoint -H "X-Team-Key: team-f91e244317ab66ff"
Outbound calls (after you /point) — we run your pointed webhook on answer:

curl -X POST https://hack.a1mobile.com/api/calls \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" -d '{"to":"+1NUMBER"}'
2. Verify a number, then call / text it
# OTP to the number you want to reach
curl -X POST https://hack.a1mobile.com/api/verified-numbers \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" -d '{"phone":"+1NUMBER"}'
# confirm with the code it receives
curl -X POST https://hack.a1mobile.com/api/verified-numbers/confirm \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" -d '{"phone":"+1NUMBER","code":"123456"}'
# then text it (add media_urls for MMS)
curl -X POST https://hack.a1mobile.com/api/sms \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" \
  -d '{"to":"+1NUMBER","body":"hello from my agent"}'
You may only call/text numbers you've OTP-verified (consent) — no cold outreach.

Receive texts — register a webhook, or poll:

curl -X POST https://hack.a1mobile.com/api/sms/webhook \
  -H "X-Team-Key: team-f91e244317ab66ff" -H "Content-Type: application/json" \
  -d '{"sms_webhook_url":"https://YOUR-SERVER/sms"}'
curl "https://hack.a1mobile.com/api/sms/inbound?since_id=0" -H "X-Team-Key: team-f91e244317ab66ff"
Relays are signed: header X-A1-Signature = HMAC-SHA256(raw body, your team key).

3. MCP (for agents)
Same tools on MCP: https://hack.a1mobile.com/mcp/ (streamable HTTP — keep the trailing slash; a browser will show a "text/event-stream" error, that's expected).

{ "mcpServers": { "a1mobile": { "type": "http", "url": "https://hack.a1mobile.com/mcp/" } } }
Pass your team_key to each tool: claim_number, number_info, point_number, unpoint_number, place_call, send_confirmation_sms, set_sms_webhook, get_inbound_sms, request_number_verification, confirm_number_verification.

← back to the portal  ·  all guides

Using the a1mobile MCP
The a1mobile telephony tools are exposed over MCP so your agent can call them directly. Endpoint:

https://hack.a1mobile.com/mcp/
Keep the trailing slash (/mcp/). Without it you get a redirect that breaks the POST.

⚠️ It's not a web page
MCP is a machine protocol (streamable HTTP, JSON-RPC). If you open the URL in a browser you'll see:

{"error":{"message":"Not Acceptable: Client must accept text/event-stream"}}
That's normal — it means the server is up and speaking MCP. You connect with an MCP client, not a browser.

Connect it
Claude Desktop / Cursor
Add to your MCP config (Claude Desktop: Settings → Developer → Edit Config; Cursor: .cursor/mcp.json):

{
  "mcpServers": {
    "a1mobile": {
      "type": "http",
      "url": "https://hack.a1mobile.com/mcp/"
    }
  }
}
Restart the app. The a1mobile tools appear in the tool list.

Test from a terminal
npx @modelcontextprotocol/inspector --cli https://hack.a1mobile.com/mcp/ \
  --transport http --method tools/list
From code (Python, fastmcp)
import asyncio
from fastmcp import Client

async def main():
    async with Client("https://hack.a1mobile.com/mcp/") as c:
        print([t.name for t in await c.list_tools()])
        r = await c.call_tool("claim_number", {"team_key": "YOUR_TEAM_KEY"})
        print(r.data)

asyncio.run(main())
Tools
Every tool takes your team_key (from your team page) as an argument.

Tool	What it does
claim_number	Claim your phone number + SIP credentials
number_info	Show your number's mode (sip/webhook) + full wiring
point_number	Programmable-voice (TeXML) mode: route voice webhook (webhook_url, optional sms_webhook_url)
unpoint_number	Revert the number to SIP mode
place_call	Outbound call from your number (to) — runs your pointed webhook on answer
send_confirmation_sms	Send SMS/MMS (to, body, optional media_urls) — verified/organizer numbers only
set_sms_webhook	Register inbound-SMS relay + delivery-receipt webhook (sms_webhook_url)
get_inbound_sms	Poll inbound SMS/MMS (since_id)
request_number_verification	Send an OTP to a number (phone) so you can call/text it
confirm_number_verification	Confirm the OTP (phone, code)
The same operations are also plain REST under https://hack.a1mobile.com/api/... (header X-Team-Key) if you'd rather not use MCP — see the portal or PARTICIPANTS.md.

← back to the portal  ·  all guides

Participant Guide — Numbers, Voice & Messaging
You get a real phone number + SIP credentials from a1mobile, with programmable calls and texts over it — enough to build any voice-AI idea, inbound or outbound. Base URL: https://hack.a1mobile.com. Your TEAM_KEY is shown on your line page. REST auth header: X-Team-Key: <TEAM_KEY>. Same tools are on MCP at /mcp/ (pass team_key to every tool).

The landing page and dashboard at hack.a1mobile.com sit behind a shared event password (announced on the day). The /api and /mcp/ endpoints below are not password-gated — they're keyed off your TEAM_KEY only.

We don't provide a Vapi account — bring your own if your stack uses Vapi.

1. Claim your number
curl -X POST https://hack.a1mobile.com/api/numbers/claim -H "X-Team-Key: $TEAM_KEY"
# → { "phone_number": "+1...", "sip_username": "...", "sip_password": "..." }
Idempotent — call it again, you get the same number back.

See your full wiring any time:

curl https://hack.a1mobile.com/api/numbers/me -H "X-Team-Key: $TEAM_KEY"
# → { phone_number, mode: "sip"|"webhook", sip_username, sip_password,
#     voice_webhook_url, sms_webhook_url, verified_numbers, allowed_sms_destinations }
mode is sip on claim (calls ring your SIP creds) and flips to webhook after you /point. To go back to SIP: POST /api/numbers/unpoint.

2. Wire it to your agent — two ways
A) Webhook / TeXML mode (works with anything: Pipecat, your own server, or bridging to Vapi/LiveKit)
Point your number's voice webhook at your public HTTPS server:

curl -X POST https://hack.a1mobile.com/api/numbers/point \
  -H "X-Team-Key: $TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://<your-public-host>/voice"}'
On an inbound call a1mobile POSTs to your webhook; return TeXML. Examples: - Pipecat / your own media server: <Response><Connect><Stream url="wss://<you>/ws"/></Connect></Response> (see bot.py). - Bridge to Vapi or LiveKit over SIP: return <Response><Dial><Sip>sip:<your-vapi-or-livekit-uri></Sip></Dial></Response>.

B) SIP trunk mode (register the credentials directly)
Use sip_username / sip_password at host sip.telnyx.com as a SIP trunk: - LiveKit: create a SIP inbound trunk with these credentials (LiveKit SIP), route to your agent/room. - Vapi: add a BYO SIP trunk with these credentials and import the number, or point the number (mode A) at Vapi's SIP URI. - Outbound calls: originate through the same SIP credential connection from your framework.

Exact screen-by-screen steps vary by platform version — check the current Vapi/LiveKit SIP docs. Mode A (webhook) is the most reliable default if SIP setup fights you.

C) Place an outbound call (REST — no SIP setup)
Trigger a call from your number; on answer we run your pointed voice webhook (same bot as inbound). Point your number first (mode A), then:

curl -X POST https://hack.a1mobile.com/api/calls -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" -d '{"to":"<destination>"}'
# → { "call_sid": "...", "to": "...", "from": "<your-number>", "status": "queued" }
Same consent rule as texts: to must be a judge line or a number you've verified.

3. Send texts (SMS + MMS)
curl -X POST https://hack.a1mobile.com/api/sms -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"<recipient-number>","body":"whatever your product needs to say"}'
# MMS: add media (image/gif/etc). body optional when media_urls is present.
#   -d '{"to":"<recipient>","body":"caption","media_urls":["https://.../pic.jpg"]}'
SMS only delivers to numbers you've verified as your own (see below) or organizer-provided test lines. Anything else → 403. This isn't a limitation of the sandbox — it's the consent rule: you may only call or text a number that's proven consent (OTP) or is explicitly a test line.

3b. Receive texts (inbound SMS)
Inbound texts to your number are delivered to a webhook you register with us — nothing to configure in Telnyx. Two ways to consume them:

# Register (or re-register) your inbound-SMS webhook:
curl -X POST https://hack.a1mobile.com/api/sms/webhook -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sms_webhook_url":"https://<your-public-host>/sms"}'
# (or pass sms_webhook_url alongside webhook_url in /api/numbers/point)
When someone texts your number we POST to your URL: {"from":"+1...","to":"<your-number>","text":"...","telnyx_id":"..."}.

No public server? Poll instead:

curl "https://hack.a1mobile.com/api/sms/inbound?since_id=0" -H "X-Team-Key: $TEAM_KEY"
# → { "messages": [ {"id":1,"from_number":"+1...","body":"...","media_urls":[],"created_at":"..."} ] }
Pass the highest id you've seen as since_id to fetch only newer messages.

Delivery receipts (DLR): we also POST outbound status to your SMS webhook — {"type":"message.status","telnyx_id":"...","to":"...","status":"delivered|sending_failed|...","errors":[]}. Verify our webhook calls: every relay carries header X-A1-Signature = hex HMAC-SHA256 of the raw body keyed by your TEAM_KEY. Recompute and compare to trust it's from us.

4. Verify a number (so you're allowed to call/text it)
# 1. request an OTP to the phone
curl -X POST https://hack.a1mobile.com/api/verified-numbers -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" -d '{"phone":"+1<the-number>"}'
# 2. enter the code you received
curl -X POST https://hack.a1mobile.com/api/verified-numbers/confirm -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" -d '{"phone":"+1<the-number>","code":"<otp>"}'
# now calls/texts to this number are allowed
Verify your own phone to test with, or verify a judge's/teammate's number once they've consented — the OTP proves it.

International numbers
Your a1mobile number can call international numbers (US, CA, and participant countries: AE, IN, TW, KR, FI are enabled). Inbound calls from anywhere work. Texting internationally is best-effort — a US number's SMS to some countries (esp. KR/IN) may be delayed or dropped by the destination carrier; prefer a call for a reliable cross-border demo. If a verification OTP doesn't arrive on an international phone, ask an organizer to whitelist it manually.

MCP tools (/mcp/, pass team_key)
claim_number, number_info, point_number, unpoint_number, place_call, send_confirmation_sms, set_sms_webhook, get_inbound_sms, request_number_verification, confirm_number_verification.

Rules that matter
Consent-based calling only. Only call/text numbers that have completed OTP verification, or organizer-provided test lines. No cold outreach to real third parties.


← back to the portal  ·  all guides

TeXML — voice webhook cheatsheet
When you point your number at a webhook, an inbound call makes a1mobile/Telnyx POST to your URL. You reply with a TeXML document (XML) telling the call what to do. TeXML is TwiML-compatible. Full reference: https://developers.telnyx.com/docs/voice/programmable-voice/texml-fundamentals

Point your number:

curl -X POST https://hack.a1mobile.com/api/numbers/point -H "X-Team-Key: $TEAM_KEY" \
  -H "Content-Type: application/json" -d '{"webhook_url":"https://YOUR-SERVER/voice"}'
Your /voice endpoint must return Content-Type: application/xml (or text/xml) and a <Response>…</Response> body.

The request you receive
Telnyx POSTs form-encoded call data: CallSid, From, To, Direction, CallStatus, etc. You don't have to read them for a basic flow — just return TeXML.

Minimal example
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! You reached my hackathon agent.</Say>
</Response>
The verbs you'll actually use
<Say> — text to speech
<Say voice="alice" language="en-US">Please hold while I connect you.</Say>
<Play> — play an audio file
<Play>https://your-server/greeting.mp3</Play>
<Gather> — collect DTMF / speech, then POST the result to action
<Gather input="dtmf" numDigits="1" action="https://YOUR-SERVER/handle-key" method="POST">
  <Say>Press 1 for sales, 2 for support.</Say>
</Gather>
<Dial><Sip> — bridge the call to a SIP address ← how you connect a BYO agent
This is how you send an inbound call into Vapi / LiveKit / Retell, etc.

<Response>
  <Dial>
    <Sip>sip:YOUR_AGENT_SIP_URI</Sip>
  </Dial>
</Response>
Examples of the SIP target: - Retell: sip:+1YOURNUMBER@sip.retellai.com - Vapi / LiveKit: the SIP URI they give you for your assistant/room.

<Connect><Stream> — stream call audio to your websocket ← for Pipecat / custom media
<Response>
  <Connect>
    <Stream url="wss://YOUR-SERVER/ws" />
  </Connect>
</Response>
Your websocket then gets the media frames (see the starter-kit bot.py).

<Hangup> / <Reject> / <Pause> / <Redirect>
<Hangup/>
<Reject reason="busy"/>
<Pause length="2"/>
<Redirect method="POST">https://YOUR-SERVER/next-step</Redirect>
Two common recipes
Inbound → my BYO agent (Retell/Vapi/LiveKit):

<Response>
  <Dial><Sip>sip:+13809990450@sip.retellai.com</Sip></Dial>
</Response>
Inbound → my own media server (Pipecat):

<Response>
  <Connect><Stream url="wss://my-ngrok-host/ws" /></Connect>
</Response>
Gotchas
Return valid XML with the <Response> root and the right content-type, or the call drops.
Your webhook must answer fast (a couple of seconds). Do heavy work after answering.
Re-pointing is fine — POST /api/numbers/point again with a new URL updates the routing (it no longer errors, so change your ngrok/host freely).
