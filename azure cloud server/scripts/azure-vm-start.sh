#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-webdrop-wss-test}"
VM_NAME="${AZURE_VM_NAME:-webdrop-wss-01}"
HEALTH_URL="${WEBDROP_HEALTH_URL:-https://webdrop-wss-0617.japaneast.cloudapp.azure.com/readyz}"
WAIT_SECONDS="${WEBDROP_START_WAIT_SECONDS:-180}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required. Install it with: brew install azure-cli" >&2
  exit 1
fi
if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not authenticated. Run: az login" >&2
  exit 1
fi

power_state="$(az vm get-instance-view \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0]" \
  --output tsv)"

if [[ "$power_state" != "VM running" ]]; then
  echo "Starting ${VM_NAME} in ${RESOURCE_GROUP} (current state: ${power_state:-unknown})..."
  az vm start \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --output none
else
  echo "${VM_NAME} is already running."
fi

public_ip="$(az vm show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --show-details \
  --query publicIps \
  --output tsv)"
echo "Public address: ${public_ip:-not assigned}"

deadline=$((SECONDS + WAIT_SECONDS))
until curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "VM is running, but ${HEALTH_URL} did not become ready within ${WAIT_SECONDS}s." >&2
    echo "Inspect with: az vm run-command invoke -g ${RESOURCE_GROUP} -n ${VM_NAME} --command-id RunShellScript --scripts 'systemctl status webdrop-signaling --no-pager; nginx -t'" >&2
    exit 1
  fi
  sleep 5
done

echo "WebDrop signaling is ready at ${HEALTH_URL}."
