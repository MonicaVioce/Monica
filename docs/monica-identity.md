# Making the sender look like "Monica" (name + avatar)

Goal: when Monica texts you, the thread shows **Monica** with her avatar — not a bare
phone number.

## The hard truth first

**SMS has no sender-name or avatar field.** What the recipient sees is decided entirely
by *their* phone: if the number is in their Contacts, they see that contact's name and
photo; otherwise they see the raw number. There is no API that pushes an avatar through
the SMS pipe. (The real-world fix is RCS Business Messaging / Apple Messages for
Business — verified-brand programs that take weeks of registration, not hackathon
material.)

So every practical option is some way of **getting a "Monica" contact card onto the
user's phone**:

## Option 1 — demo phone, 60 seconds (do this for today)

On the demo iPhone: save `+1 (346) 301-6959` as a contact named **Monica**, set
[`assets/monica-avatar.jpg`](../assets/) as the contact photo. Done — every past and
future message in the thread instantly shows the name + avatar.

## Option 2 — in-band vCard (automated, one tap for the user)

A vCard (`.vcf`) can carry the name **and** an embedded photo. Flow:

1. Drop the avatar image at `assets/monica-avatar.jpg`
2. Run [`scripts/make-vcard.sh`](../scripts/make-vcard.sh) — generates
   `assets/Monica.vcf` with the photo base64-embedded (`PHOTO;ENCODING=b;TYPE=JPEG`)
   and our number as `TEL`
3. Host the `.vcf` at any public URL and MMS it:

```bash
curl -X POST https://hack.a1mobile.com/api/sms \
  -H "X-Team-Key: $A1_TEAM_KEY" -H "Content-Type: application/json" \
  -d '{"to":"+1XXXXXXXXXX","body":"Save me 💅","media_urls":["https://YOUR-HOST/Monica.vcf"]}'
```

The user taps the card → "Create New Contact" → the thread becomes Monica. This is the
right onboarding move for real users ("text START, get Monica's contact card back").

Notes:
- `Monica.vcf` is **gitignored** by default because it embeds our real number; commit
  it deliberately if you want to use the repo's raw URL as the public host.
- MMS vCard support varies slightly by carrier — test on the demo phone before the
  stage. Fallback: Option 1.

## Option 3 — the iMessage path (blue bubbles)

If/when we ship results over iMessage via a Mac bridge (AppleScript or BlueBubbles —
see the earlier research in the team notes), Messages has profile sharing built in:
on the bridge Mac, Messages → Settings → **Share Name and Photo** → name it
**Monica**, set the avatar. Recipients get a native "Monica shared a name and photo"
prompt — accept once and the thread is branded, no contact card needed.

## Recommendation

Today's demo: **Option 1** (zero risk). Real onboarding: **Option 2**. iMessage
version: **Option 3** comes for free with the bridge.
