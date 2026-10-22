#!/usr/bin/env bash
# Usage: azure-setup.sh <talk>
# Run once before the talk. Creates one Linux App Service plan and one web app per
# run in runs.yaml, configured for a single-process Node game over WebSockets.
# Writes talks/<talk>/azure.env, urls.md and qr/<run>.png. Safe to rerun.
#
# Overrides: AZ_LOCATION (default swedencentral), AZ_SKU (default B1; P0v3 builds
# faster if five parallel deploys are slow), AZ_RG, AZ_PREFIX.
set -euo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: azure-setup.sh <talk>}"
dir="$(talk_dir "$talk")"
loc="${AZ_LOCATION:-swedencentral}"
sku="${AZ_SKU:-B1}"
slug_talk="$(tr '[:upper:]' '[:lower:]' <<<"$talk" | tr -c 'a-z0-9\n' '-')"
rg="${AZ_RG:-rg-aidev-$slug_talk}"
prefix="${AZ_PREFIX:-aidev-$slug_talk}"
plan="plan-$prefix"

echo "subscription: $(az account show --query name -o tsv)"
echo "resource group $rg in $loc, plan $plan ($sku)"

az group create -n "$rg" -l "$loc" --tags purpose=talk talk="$talk" -o none
az appservice plan show -g "$rg" -n "$plan" -o none 2>/dev/null \
  || az appservice plan create -g "$rg" -n "$plan" --is-linux --sku "$sku" -o none

urls="| Run | URL |\n| --- | --- |\n"
mkdir -p "$dir/qr"
while read -r run skills effort port; do
  app="$prefix-$(run_slug "$run")"
  (( ${#app} <= 60 )) || { echo "app name too long (max 60): $app; set AZ_PREFIX" >&2; exit 1; }

  az webapp show -g "$rg" -n "$app" -o none 2>/dev/null \
    || az webapp create -g "$rg" -p "$plan" -n "$app" --runtime "NODE:22-lts" -o none
  # WebSockets on; ARR affinity keeps a player's connection on one instance;
  # always-on so in-memory games survive idle minutes; npm start is the contract.
  az webapp config set -g "$rg" -n "$app" --web-sockets-enabled true --always-on true \
    --startup-file "npm start" -o none
  az webapp update -g "$rg" -n "$app" --client-affinity-enabled true -o none
  # Oryx runs npm install (and npm run build, if present) on the server.
  az webapp config appsettings set -g "$rg" -n "$app" -o none \
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true WEBSITES_CONTAINER_START_TIME_LIMIT=600

  url="https://$app.azurewebsites.net"
  urls+="| $run | $url |\n"
  npx --yes qrcode@1.5.4 -o "$dir/qr/$(run_slug "$run").png" -w 600 "$url" >/dev/null
  echo "ready: $run → $url"
done < <(read_runs "$dir/runs.yaml")

printf 'AZ_RG=%s\nAZ_PLAN=%s\nAZ_PREFIX=%s\n' "$rg" "$plan" "$prefix" > "$dir/azure.env"
printf "$urls" > "$dir/urls.md"
echo "wrote $dir/azure.env, urls.md and qr/. Put the QR codes on the Play it slide."
