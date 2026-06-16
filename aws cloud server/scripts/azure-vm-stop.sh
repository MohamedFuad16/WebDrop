#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-webdrop-wss-test}"
VM_NAME="${AZURE_VM_NAME:-webdrop-wss-01}"

az vm deallocate \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME"

echo "Deallocated ${VM_NAME} in ${RESOURCE_GROUP}."
