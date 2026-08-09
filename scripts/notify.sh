#!/usr/bin/env bash
# Send an SMS from Monica's number.
# Usage: A1_TEAM_KEY=team-... ./scripts/notify.sh +1XXXXXXXXXX "Refund approved 🎉"
# The recipient must be OTP-verified first (see scripts/verify-number.sh).
set -euo pipefail

[ -n "${A1_TEAM_KEY:-}" ] || { echo "Set A1_TEAM_KEY (see .env.example)" >&2; exit 1; }
[ $# -eq 2 ] || { echo "Usage: $0 <+1XXXXXXXXXX> <message>" >&2; exit 1; }

BODY=$(printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

curl -sS -X POST https://hack.a1mobile.com/api/sms \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d "{\"to\":\"$1\",\"body\":$BODY}"
echo
