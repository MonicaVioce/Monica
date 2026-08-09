#!/usr/bin/env bash
# Generate assets/Monica.vcf — a contact card with the avatar photo embedded.
# Prereq: put the avatar at assets/monica-avatar.jpg
# Usage: MONICA_NUMBER=+13463016959 ./scripts/make-vcard.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IMG=assets/monica-avatar.jpg
[ -f "$IMG" ] || { echo "Put the avatar image at $IMG first" >&2; exit 1; }
[ -n "${MONICA_NUMBER:-}" ] || { echo "Set MONICA_NUMBER (Monica's outbound number)" >&2; exit 1; }

B64=$(base64 -i "$IMG" | tr -d '\n')

cat > assets/Monica.vcf <<EOF
BEGIN:VCARD
VERSION:3.0
N:;Monica;;;
FN:Monica
ORG:Monica — your AI big sis
TEL;TYPE=CELL:$MONICA_NUMBER
PHOTO;ENCODING=b;TYPE=JPEG:$B64
END:VCARD
EOF

echo "Wrote assets/Monica.vcf ($(wc -c < assets/Monica.vcf | tr -d ' ') bytes)"
echo "Note: it embeds the real number, so it's gitignored — host or commit it deliberately."
