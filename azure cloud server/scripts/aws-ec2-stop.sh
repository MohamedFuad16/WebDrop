#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${AWS_INSTANCE_ID:-i-033324ec6baf53aca}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI is required. Install it from https://aws.amazon.com/cli/" >&2
  exit 1
fi
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "AWS CLI is not authenticated. Run: aws login (or configure credentials)" >&2
  exit 1
fi

# Stop (not terminate): the EBS volume and Elastic IP association survive, so a
# later start brings the same host back at the same address. Note AWS bills a
# small hourly fee for an Elastic IP while its instance is stopped.
aws ec2 stop-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --output text >/dev/null
aws ec2 wait instance-stopped \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID"

state="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].State.Name" \
  --output text)"
echo "Stopped ${INSTANCE_ID} in ${AWS_REGION}. Current state: ${state:-unknown}."
