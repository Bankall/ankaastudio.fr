#!/usr/bin/env bash
#
# Puts the DNS behind the gallery's emails in order, so a receiving mail server has
# every reason to trust them: SPF and DKIM both aligned with the From domain, and a
# DMARC record saying so.
#
# What was wrong without it — and why a client's inbox filed a message as spam:
#   - SES signs with DKIM as ankaastudio.fr (already set up: the three _domainkey
#     CNAMEs), but bounces from, and SPF-authenticates as, *.amazonses.com. The From
#     domain and the envelope domain disagree, so SPF is not *aligned*, and a
#     receiver that wants both signals (La Poste, Gmail, Yahoo) sees only one.
#   - The domain's SPF (`include:mx.ovh.com -all`) names only OVH's servers.
#   - There was no DMARC record at all, which the same receivers now hold against a
#     sender.
#
# What it does, idempotently (every record is an UPSERT):
#   1. Tells SES to use mail.<domain> as the MAIL FROM (envelope) domain, so the
#      bounce address — and with it SPF — is ours and aligns with From.
#   2. Writes the two records that subdomain needs: an MX pointing back at SES's
#      feedback server for the region, and an SPF TXT authorising SES.
#   3. Adds `include:amazonses.com` to the root SPF, keeping whatever else is there
#      (OVH's include, and its ownership marker). Covers the fallback SES takes if
#      the MAIL FROM MX ever fails to resolve.
#   4. Publishes a DMARC record at _dmarc. Policy `none` to start: it asks receivers
#      to report, not to act, so nothing the studio sends by other means — the OVH
#      mailbox itself, from a phone — can be caught out while the reports show what
#      is passing. Set DMARC_POLICY=quarantine once a few weeks of reports are clean.
#
# Nothing here touches the stack: DNS lives in Route 53 in the same account and is
# managed by hand, as the A/AAAA aliases already are. Run once, then watch
#   aws sesv2 get-email-identity --email-identity ankaastudio.fr --profile bankall
# until MailFromAttributes.MailFromDomainStatus reads SUCCESS (minutes, up to an hour).
#
# Usage: ./setup-mail-dns.sh [--dry-run]
#   --dry-run  print the Route 53 change batch and the SES call, change nothing.

set -euo pipefail

# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

: "${DOMAIN_NAME:?Set DOMAIN_NAME in infra/.env.deploy}"
: "${SENDER_EMAIL:?Set SENDER_EMAIL in infra/.env.deploy}"

# `none` reports, `quarantine` files failures as spam, `reject` refuses them. Start
# at none — see the header — and raise it from the environment when ready:
#   DMARC_POLICY=quarantine ./setup-mail-dns.sh
DMARC_POLICY="${DMARC_POLICY:-none}"
# Where receivers send their daily aggregate reports (XML attachments, one per
# receiver per day). The sender mailbox by default; a dedicated address is tidier.
DMARC_RUA="${DMARC_RUA:-mailto:$SENDER_EMAIL}"

DRY_RUN=0
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=1 ;;
		*)
			echo "Unknown flag: $arg" >&2
			exit 1
			;;
	esac
done

if [[ "${SENDER_EMAIL#*@}" != "$DOMAIN_NAME" ]]; then
	echo "✗ SENDER_EMAIL ($SENDER_EMAIL) is not under DOMAIN_NAME ($DOMAIN_NAME); the SES domain identity must be the sender's." >&2
	exit 1
fi

case "$DMARC_POLICY" in
	none | quarantine | reject) ;;
	*)
		echo "✗ DMARC_POLICY must be none, quarantine or reject." >&2
		exit 1
		;;
esac

MAIL_FROM="mail.$DOMAIN_NAME"
# SES's bounce receiver for the sending region: the MX of the MAIL FROM domain has
# to point at it, or SES falls back to amazonses.com and nothing here helps.
FEEDBACK_MX="feedback-smtp.${AWS_REGION}.amazonses.com"

# The identity has to be the domain, verified, or there is nothing to attach a MAIL
# FROM to — and DKIM has to be on, or aligning SPF would leave half the job undone.
IDENTITY="$("${AWS[@]}" sesv2 get-email-identity --email-identity "$DOMAIN_NAME" --output json 2>/dev/null || true)"
if [[ -z "$IDENTITY" ]]; then
	echo "✗ $DOMAIN_NAME is not an SES identity in $AWS_REGION. Create and verify it first:" >&2
	echo "    aws sesv2 create-email-identity --email-identity $DOMAIN_NAME --profile $AWS_PROFILE --region $AWS_REGION" >&2
	exit 1
fi

python3 - "$IDENTITY" <<'PY'
import json, sys
identity = json.loads(sys.argv[1])
problems = []
if identity.get("VerificationStatus") != "SUCCESS":
    problems.append(f"domain verification is {identity.get('VerificationStatus')}")
dkim = identity.get("DkimAttributes", {})
if not dkim.get("SigningEnabled") or dkim.get("Status") != "SUCCESS":
    problems.append(f"DKIM signing is {dkim.get('Status')} — publish the three _domainkey CNAMEs first")
if problems:
    sys.exit("✗ " + "; ".join(problems) + ".")
PY

ZONE_ID="$("${AWS[@]}" route53 list-hosted-zones-by-name --dns-name "$DOMAIN_NAME" \
	--query "HostedZones[?Name=='${DOMAIN_NAME}.'].Id | [0]" --output text)"
ZONE_ID="${ZONE_ID#/hostedzone/}"

if [[ -z "$ZONE_ID" || "$ZONE_ID" == "None" ]]; then
	echo "✗ No Route 53 hosted zone for $DOMAIN_NAME in this account. If the zone is elsewhere, create these records there by hand (run with --dry-run to see them)." >&2
	exit 1
fi

# Every TXT value at the apex, so the SPF one can be replaced and the others kept: a
# TXT record set is written whole, and OVH's ownership marker lives in the same set.
ROOT_TXT="$("${AWS[@]}" route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
	--query "ResourceRecordSets[?Name=='${DOMAIN_NAME}.' && Type=='TXT'].ResourceRecords[].Value" --output json)"

CHANGE_BATCH="$(python3 - "$DOMAIN_NAME" "$MAIL_FROM" "$FEEDBACK_MX" "$DMARC_POLICY" "$DMARC_RUA" "$ROOT_TXT" <<'PY'
import json, sys

domain, mail_from, feedback, policy, rua, root_txt = sys.argv[1:7]

# Route 53 hands TXT values back quoted, and wants them back the same way.
values = [v.strip('"') for v in json.loads(root_txt or "[]")]
others = [v for v in values if not v.lower().startswith("v=spf1")]
spf = next((v for v in values if v.lower().startswith("v=spf1")), "v=spf1 -all").split()

# The SES include goes in ahead of the closing `all` qualifier, once.
if "include:amazonses.com" not in spf:
    tail = spf.pop() if spf[-1].lower() in ("-all", "~all", "?all", "+all", "all") else None
    spf.append("include:amazonses.com")
    if tail:
        spf.append(tail)

quoted = lambda v: '"' + v + '"'

def upsert(name, rtype, record_values, ttl=3600):
    return {
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": name,
            "Type": rtype,
            "TTL": ttl,
            "ResourceRecords": [{"Value": v} for v in record_values],
        },
    }

changes = [
    upsert(domain, "TXT", [quoted(v) for v in others] + [quoted(" ".join(spf))]),
    upsert(mail_from, "MX", [f"10 {feedback}"]),
    upsert(mail_from, "TXT", [quoted("v=spf1 include:amazonses.com ~all")]),
    # Relaxed alignment (the default, spelled out): mail.<domain> counts as <domain>.
    upsert(f"_dmarc.{domain}", "TXT", [quoted(f"v=DMARC1; p={policy}; rua={rua}; adkim=r; aspf=r")]),
]

print(json.dumps({"Comment": "SES MAIL FROM, SPF and DMARC for the gallery emails", "Changes": changes}, indent=2))
PY
)"

echo "→ SES: MAIL FROM domain of $DOMAIN_NAME → $MAIL_FROM (falls back to amazonses.com if its MX is unreachable)"
echo "→ Route 53 zone $ZONE_ID, change batch:"
echo "$CHANGE_BATCH"

if (( DRY_RUN )); then
	echo "(dry run — nothing changed)"
	exit 0
fi

"${AWS[@]}" sesv2 put-email-identity-mail-from-attributes \
	--email-identity "$DOMAIN_NAME" \
	--mail-from-domain "$MAIL_FROM" \
	--behavior-on-mx-failure USE_DEFAULT_VALUE

CHANGE_ID="$("${AWS[@]}" route53 change-resource-record-sets \
	--hosted-zone-id "$ZONE_ID" \
	--change-batch "$CHANGE_BATCH" \
	--query ChangeInfo.Id --output text)"

echo "→ Waiting for Route 53 to propagate $CHANGE_ID ..."
"${AWS[@]}" route53 wait resource-record-sets-changed --id "$CHANGE_ID"

STATUS="$("${AWS[@]}" sesv2 get-email-identity --email-identity "$DOMAIN_NAME" \
	--query MailFromAttributes.MailFromDomainStatus --output text)"

echo "✓ Records published. SES MAIL FROM status: $STATUS"
if [[ "$STATUS" != "SUCCESS" ]]; then
	echo "  SES checks the MX itself and usually confirms within the hour. Until then mail still goes out, enveloped from amazonses.com as before."
	echo "  Watch:  aws sesv2 get-email-identity --email-identity $DOMAIN_NAME --profile $AWS_PROFILE --region $AWS_REGION --query MailFromAttributes"
fi
echo "  DMARC is at p=$DMARC_POLICY, reports to $DMARC_RUA. Raise it with DMARC_POLICY=quarantine once they are clean."
