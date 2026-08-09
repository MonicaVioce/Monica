# Reproduce Monica locally

This guide runs Monica on a developer laptop, exposes it temporarily through
Cloudflare Tunnel, points an A1 Mobile number to the local voice webhook, and
places a consented test call.

## What you need

- Node.js 22 or later and npm
- A Cloudflare Tunnel client (`cloudflared`)
- An OpenAI API key with Realtime access
- An A1 Mobile team key and a claimed team number
- A phone number you own or a teammate's number for which they have completed
  A1's OTP verification. Do not place calls to hotels or other third parties
  during development unless they have explicitly consented.

On macOS, install the tunnel client once:

```bash
brew install cloudflared
```

## 1. Clone and configure

```bash
git clone https://github.com/MonicaVioce/Monica.git
cd Monica
npm install
cp .env.example .env
```

Edit `.env` locally. At a minimum, set:

```env
OPENAI_API_KEY=your_openai_key
A1_TEAM_KEY=your_a1_team_key
MONICA_ADMIN_TOKEN=a-long-random-value
MONICA_CASE_CONTEXT={"customer_name":"Demo Customer","company":"Demo Hotel","reservation_or_case_id":"TEST-123","issue":"A test refund request","requested_resolution":"A partial refund","acceptance_limit":"Do not accept an offer without customer approval","authorized_actions":["Request a case number"]}
```

Never commit `.env`, paste it into GitHub issues, or send it in chat. It holds
credentials that can incur OpenAI usage or control the A1 Mobile number. The
tracked `.env.example` is the shareable template; distribute real values using
a password manager or your team secret manager.

For the A1 commands below, export the values from your local `.env` in the
terminal where you run them:

```bash
set -a
source .env
set +a
```

## 2. Start the local bridge

In terminal one:

```bash
npm run dev
```

This starts the Next.js app and the local WebSocket listener needed by A1's
bidirectional media stream. Do not replace it with `next dev`; that command
does not register the media WebSocket listener.

Confirm it is running:

```bash
curl --fail http://localhost:3000/api/health
```

Expected response:

```json
{"ok":true,"case_store":"memory-preview-only"}
```

`memory-preview-only` is expected for local testing. Restarting the server
clears local call notes and case state.

## 3. Create a temporary public URL

In terminal two, keep this process running for the whole call:

```bash
npm run tunnel
```

Copy the URL printed by Cloudflare, for example:

```text
https://example-name.trycloudflare.com
```

Set `PUBLIC_BASE_URL` in `.env` to that URL, then restart terminal one:

```env
PUBLIC_BASE_URL=https://example-name.trycloudflare.com
```

Quick Tunnel URLs change whenever you restart `npm run tunnel`. Repeat this
step whenever that happens. This tunnel is for development—not production.

Verify the public endpoints before connecting A1:

```bash
curl --fail https://example-name.trycloudflare.com/api/health
curl --fail --request POST https://example-name.trycloudflare.com/api/voice \
  --data 'CallSid=local-check'
```

The second response is XML containing a `wss://example-name.trycloudflare.com/api/ws`
media URL.

## 4. Point A1 Mobile at your local bridge

Use the tunnel URL from step 3. This changes where calls to the team A1 number
are handled; it does not place a call.

```bash
curl --request POST https://hack.a1mobile.com/api/numbers/point \
  --header "X-Team-Key: $A1_TEAM_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"webhook_url":"https://example-name.trycloudflare.com/api/voice"}'
```

Check that the number is now in webhook mode:

```bash
curl https://hack.a1mobile.com/api/numbers/me \
  --header "X-Team-Key: $A1_TEAM_KEY"
```

## 5. Place a consented test call

First OTP-verify a test phone number if it has not already been verified by
A1. The phone owner must supply the code received on their device:

```bash
curl --request POST https://hack.a1mobile.com/api/verified-numbers \
  --header "X-Team-Key: $A1_TEAM_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"phone":"+1YOUR_TEST_PHONE"}'

curl --request POST https://hack.a1mobile.com/api/verified-numbers/confirm \
  --header "X-Team-Key: $A1_TEAM_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"phone":"+1YOUR_TEST_PHONE","code":"THE_OTP_CODE"}'
```

Then place the test call:

```bash
curl --request POST https://hack.a1mobile.com/api/calls \
  --header "X-Team-Key: $A1_TEAM_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"to":"+1YOUR_TEST_PHONE"}'
```

The local terminal should show the call activity. On answer, Monica introduces
itself as an AI acting with the customer's permission. The test recipient can
say a few customer-service-style prompts and then hang up.

## Optional: set per-call case facts

`MONICA_CASE_CONTEXT` is the reliable local-development default. For a call
whose A1 response includes a `call_sid`, you can also save structured case facts
to the local case API before the call is answered:

```bash
curl --request PUT "https://example-name.trycloudflare.com/api/cases/CALL_SID" \
  --header "Authorization: Bearer $MONICA_ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"customer_name":"Demo Customer","company":"Demo Hotel","reservation_or_case_id":"TEST-123","issue":"A test refund request","requested_resolution":"A partial refund","acceptance_limit":"Do not accept an offer without customer approval","authorized_actions":["Request a case number"]}'
```

Read the saved outcome and notes:

```bash
curl "https://example-name.trycloudflare.com/api/cases/CALL_SID" \
  --header "Authorization: Bearer $MONICA_ADMIN_TOKEN"
```

## Stop and reset

Press `Ctrl-C` in the server and tunnel terminals. Since local cases are held
in memory, restarting Monica clears them. When you are done, optionally return
the A1 number to SIP mode:

```bash
curl --request POST https://hack.a1mobile.com/api/numbers/unpoint \
  --header "X-Team-Key: $A1_TEAM_KEY"
```
