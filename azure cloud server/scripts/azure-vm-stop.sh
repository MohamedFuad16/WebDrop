#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-webdrop-wss-test}"
VM_NAME="${AZURE_VM_NAME:-webdrop-wss-01}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required. Install it with: brew install azure-cli" >&2
  exit 1
fi
if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not authenticated. Run: az login" >&2
  exit 1
fi

az vm deallocate \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --output none

power_state="$(az vm get-instance-view \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus | [0]" \
  --output tsv)"
echo "Deallocated ${VM_NAME} in ${RESOURCE_GROUP}. Current state: ${power_state:-unknown}."
