#!/usr/bin/env bash
# Usage: azure-teardown.sh <talk> [--yes]
# After the talk: deletes the talk's whole resource group (plan and all its apps).
set -euo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: azure-teardown.sh <talk> [--yes]}"
dir="$(talk_dir "$talk")"
[[ -f "$dir/azure.env" ]] || { echo "no azure.env for $talk: nothing to delete" >&2; exit 1; }
source "$dir/azure.env"

echo "This deletes resource group $AZ_RG in $(az account show --query name -o tsv):"
az resource list -g "$AZ_RG" --query "[].name" -o tsv | sed 's/^/  /'
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "Type the resource group name to confirm: " answer
  [[ "$answer" == "$AZ_RG" ]] || { echo "not deleted"; exit 1; }
fi
az group delete -n "$AZ_RG" --yes --no-wait
echo "deleting $AZ_RG (runs in the background; check with: az group show -n $AZ_RG)"
