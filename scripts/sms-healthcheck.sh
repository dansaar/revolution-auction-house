#!/usr/bin/env bash
#
# SMS health check — confirms the AWS SMS setup is ready and (optionally) sends
# a test text. Uses your local AWS credentials + AWS CLI. Read-only unless you
# pass --to (which actually sends one SMS and costs a fraction of a cent).
#
# Usage:
#   ./scripts/sms-healthcheck.sh                 # status only (no send)
#   ./scripts/sms-healthcheck.sh --to +15551234567   # also send a test text
#   ./scripts/sms-healthcheck.sh --region us-east-1
#
set -euo pipefail

REGION="us-east-1"
TO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

hr() { printf '%.0s─' {1..60}; echo; }
ok() { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }

echo "SMS health check — region $REGION"
hr

# 1) Sandbox status ----------------------------------------------------------
echo "1) Account / sandbox status"
SANDBOX=$(aws sns get-sms-sandbox-account-status --region "$REGION" --query "IsInSandbox" --output text 2>/dev/null || echo "ERR")
if [[ "$SANDBOX" == "true" ]]; then
  warn "In SANDBOX — you can only text VERIFIED numbers until you request production access."
  echo "     Verified sandbox numbers:"
  aws sns list-sms-sandbox-phone-numbers --region "$REGION" --query "PhoneNumbers[].{Number:PhoneNumber,Status:Status}" --output table 2>/dev/null || echo "     (none)"
elif [[ "$SANDBOX" == "false" ]]; then
  ok "Production access granted (out of sandbox) — can text any valid number."
else
  warn "Could not read sandbox status (permissions or region?)."
fi
hr

# 2) Spend limit -------------------------------------------------------------
echo "2) Monthly spend limit (SNS)"
aws sns get-sms-attributes --region "$REGION" \
  --attributes MonthlySpendLimit DefaultSMSType DefaultSenderID \
  --query "attributes" --output table 2>/dev/null || warn "Could not read SNS SMS attributes."
echo "   End User Messaging spend limits:"
aws pinpoint-sms-voice-v2 describe-spend-limits --region "$REGION" \
  --query "SpendLimits[].{Name:Name,Enforced:EnforcedLimit,Max:MaxLimit,Override:Overridden}" --output table 2>/dev/null \
  || warn "Could not read spend limits (pinpoint-sms-voice-v2)."
hr

# 3) Origination numbers -----------------------------------------------------
echo "3) Origination phone numbers (must be ACTIVE with SMS capability)"
NUMS=$(aws pinpoint-sms-voice-v2 describe-phone-numbers --region "$REGION" \
  --query "PhoneNumbers[].{Number:PhoneNumber,Status:Status,Type:NumberType,SMS:contains(NumberCapabilities, \`SMS\`)}" \
  --output table 2>/dev/null || echo "ERR")
if [[ "$NUMS" == "ERR" || -z "$NUMS" ]]; then
  warn "No origination numbers found (or no permission). Register a 10DLC/toll-free number and attach it."
else
  echo "$NUMS"
  ACTIVE=$(aws pinpoint-sms-voice-v2 describe-phone-numbers --region "$REGION" \
    --query "length(PhoneNumbers[?Status=='ACTIVE'])" --output text 2>/dev/null || echo 0)
  if [[ "$ACTIVE" -gt 0 ]]; then ok "$ACTIVE active origination number(s)."; else warn "No ACTIVE numbers yet (still pending registration?)."; fi
fi
hr

# 4) Optional test send ------------------------------------------------------
if [[ -n "$TO" ]]; then
  echo "4) Sending test SMS to $TO …"
  MSG_ID=$(aws sns publish --region "$REGION" \
    --phone-number "$TO" \
    --message "Revolution Auction House: SMS test ✅ Your texting setup is working. Reply STOP to opt out." \
    --message-attributes '{"AWS.SNS.SMS.SMSType":{"DataType":"String","StringValue":"Transactional"}}' \
    --query "MessageId" --output text 2>&1) && ok "Sent. MessageId: $MSG_ID" \
    || warn "Send failed: $MSG_ID"
  echo "   (If in sandbox, $TO must be a verified sandbox number.)"
else
  echo "4) Test send skipped. Re-run with --to +1XXXXXXXXXX to send a real test text."
fi
hr
echo "Done."
