#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${AWS_INSTANCE_ID:-i-033324ec6baf53aca}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
# The Elastic IP stays associated across stop/start, so the nip.io hostname is stable.
HEALTH_URL="${WEBDROP_HEALTH_URL:-https://16-76-107-155.nip.io/readyz}"
WAIT_SECONDS="${WEBDROP_START_WAIT_SECONDS:-180}"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required. Install it from https://aws.amazon.com/cli/" >&2
  exit 1
fi
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS CLI is not authenticated. Run: aws login (or configure credentials)" >&2
  exit 1
fi

state="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].State.Name" \
  --output text)"

if [[ "$state" != "running" ]]; then
  echo "Starting ${INSTANCE_ID} in ${AWS_REGION} (current state: ${state:-unknown})..."
  aws ec2 start-instances \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --output text >/dev/null
  aws ec2 wait instance-running \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID"
else
  echo "${INSTANCE_ID} is already running."
fi

public_ip="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" \
  --output text)"
echo "Public address: ${public_ip:-not assigned}"

deadline=$((SECONDS + WAIT_SECONDS))
until curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "Instance is running, but ${HEALTH_URL} did not become ready within ${WAIT_SECONDS}s." >&2
    echo "Inspect with: ssh ubuntu@${public_ip} 'systemctl status webdrop-signaling caddy --no-pager'" >&2
    exit 1
  fi
  sleep 5
done

echo "WebDrop signaling is ready at ${HEALTH_URL}."
