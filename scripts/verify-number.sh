#!/usr/bin/env bash
# One-time consent verification for a recipient number (required before notify.sh).
# Usage:
#   A1_TEAM_KEY=team-... ./scripts/verify-number.sh +1XXXXXXXXXX          # sends the OTP
#   A1_TEAM_KEY=team-... ./scripts/verify-number.sh +1XXXXXXXXXX 123456   # confirms it
set -euo pipefail

[ -n "${A1_TEAM_KEY:-}" ] || { echo "Set A1_TEAM_KEY (see .env.example)" >&2; exit 1; }
[ $# -ge 1 ] || { echo "Usage: $0 <+1XXXXXXXXXX> [otp-code]" >&2; exit 1; }

if [ $# -eq 1 ]; then
  curl -sS -X POST https://hack.a1mobile.com/api/verified-numbers \
    -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
    -d "{\"phone\":\"$1\"}"
else
  curl -sS -X POST https://hack.a1mobile.com/api/verified-numbers/confirm \
    -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
    -d "{\"phone\":\"$1\",\"code\":\"$2\"}"
fi
echo
