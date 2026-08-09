# Reproduce Monica locally

This guide runs Monica on a developer laptop, exposes it temporarily through
LocalTunnel, points an A1 Mobile number to the local voice webhook, configures
OpenAI Realtime SIP, and places a consented test call.

## What you need

- Node.js 22 or later and npm
- An OpenAI API key with Realtime access
- The OpenAI project ID for that key
- An A1 Mobile team key and a claimed team number
- A phone number you own or a teammate's number for which they have completed
  A1's OTP verification. Do not place calls to hotels or other third parties
  during development unless they have explicitly consented.

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
OPENAI_PROJECT_ID=proj_your_project_id
OPENAI_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
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

## 2. Start the local server

In terminal one:

```bash
npm run dev
```

This starts the Next.js app. The custom server also retains the legacy A1 media
WebSocket endpoint for diagnostics, but normal calls use direct A1-to-OpenAI
SIP audio.

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

Copy the URL printed by LocalTunnel, for example:

```text
https://example-name.loca.lt
```

Set `PUBLIC_BASE_URL` in `.env` to that URL, then restart terminal one:

```env
PUBLIC_BASE_URL=https://example-name.loca.lt
```

Tunnel URLs can change whenever you restart `npm run tunnel`. Repeat this step
whenever that happens. This tunnel is for development—not production.

Verify the public endpoints before connecting A1:

```bash
curl --fail https://example-name.loca.lt/api/health
curl --fail --request POST https://example-name.loca.lt/api/voice \
  --data 'CallSid=local-check'
```

The second response is XML containing a `<Dial><Sip>` target for
`sip:proj_...@sip.api.openai.com;transport=tls`.

## 4. Configure the OpenAI incoming-call webhook

In [OpenAI Platform settings](https://platform.openai.com/settings/), open the
project used by `OPENAI_API_KEY`:

1. Under **Project → General**, copy the `proj_...` project ID into
   `OPENAI_PROJECT_ID`.
2. Under **Project → Webhooks**, create an endpoint for:

   ```text
   https://example-name.loca.lt/api/openai/realtime-webhook
   ```

3. Subscribe it to `realtime.call.incoming`.
4. Copy the displayed signing secret into `OPENAI_WEBHOOK_SECRET`.
5. Restart `npm run dev` after editing `.env`.

The signing secret is required. Monica verifies the raw webhook body using the
official OpenAI SDK and rejects unsigned or modified events.

## 5. Point A1 Mobile at your local server

Use the tunnel URL from step 3. This changes where calls to the team A1 number
are handled; it does not place a call.

```bash
curl --request POST https://hack.a1mobile.com/api/numbers/point \
  --header "X-Team-Key: $A1_TEAM_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"webhook_url":"https://example-name.loca.lt/api/voice"}'
```

Check that the number is now in webhook mode:

```bash
curl https://hack.a1mobile.com/api/numbers/me \
  --header "X-Team-Key: $A1_TEAM_KEY"
```

## 6. Place a consented test call

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

The local terminal should log `Accepted OpenAI SIP call`. On answer, Monica introduces
itself as an AI acting with the customer's permission. The test recipient can
say a few customer-service-style prompts and then hang up.

## Optional: set per-call case facts

`MONICA_CASE_CONTEXT` is the reliable local-development default. For a call
whose A1 response includes a `call_sid`, you can also save structured case facts
to the local case API before the call is answered:

```bash
curl --request PUT "https://example-name.loca.lt/api/cases/CALL_SID" \
  --header "Authorization: Bearer $MONICA_ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{"customer_name":"Demo Customer","company":"Demo Hotel","reservation_or_case_id":"TEST-123","issue":"A test refund request","requested_resolution":"A partial refund","acceptance_limit":"Do not accept an offer without customer approval","authorized_actions":["Request a case number"]}'
```

Read the saved outcome and notes:

```bash
curl "https://example-name.loca.lt/api/cases/CALL_SID" \
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
