#!/usr/bin/env bash
# Usage: deploy.sh <talk> [run ...]
# End of the timebox: packages each run's working tree as it is right now and
# zip-deploys all runs to their App Service apps in parallel. Needs azure-setup.sh first.
# Packaging uses a throwaway git index, so uncommitted work ships but the run's
# history (and its "minutes to last commit") is untouched.
set -uo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: deploy.sh <talk> [run ...]}"
shift
dir="$(talk_dir "$talk")"
[[ -f "$dir/azure.env" ]] || { echo "no azure.env: run scripts/azure-setup.sh $talk first" >&2; exit 1; }
source "$dir/azure.env"
only=" $* "
logs="$dir/results/deploy"
mkdir -p "$logs"

deploy_one() {
  local run="$1" rdir="$dir/runs/$1" slug app zip tmp tree
  slug="$(run_slug "$run")"
  app="$AZ_PREFIX-$slug"
  zip="$logs/$slug.zip"
  tmp="$(mktemp -d)"
  # A pack that builds outside the run (firstmate's clone) brings its work back first.
  [[ -f "$rdir/.agent-collect" ]] && bash "$rdir/.agent-collect"
  # Snapshot tracked + untracked (non-ignored) files without touching the run's index.
  GIT_INDEX_FILE="$tmp/index" git -C "$rdir" add -A
  tree="$(GIT_INDEX_FILE="$tmp/index" git -C "$rdir" write-tree)"
  rm -rf "$tmp"
  git -C "$rdir" archive --format=zip -o "$zip" "$tree" \
    -- . ':!.claude' ':!.claude-home' ':!.firstmate' ':!reports'
  # --track-status false: the CLI's own "starting the site" wait hangs on Linux
  # apps that are already up; the URL check below is faster and more honest.
  if az webapp deploy -g "$AZ_RG" -n "$app" --src-path "$zip" --type zip --track-status false -o none >"$logs/$slug.log" 2>&1; then
    echo "uploaded $run"
  else
    echo "FAILED  $run: upload or build (see $logs/$slug.log)"
  fi
}

# Wait until the run's own app answers: not Azure's placeholder page, not the crash page.
check_one() {
  local run="$1" url="https://$AZ_PREFIX-$(run_slug "$1").azurewebsites.net" body code status="timeout" t0=$SECONDS
  while (( SECONDS - t0 < ${DEPLOY_TIMEOUT:-300} )); do
    body="$(curl -s --max-time 20 -w '\n%{http_code}' "$url")"
    code="${body##*$'\n'}"
    if grep -qiE 'hostingstart|waiting for your content|Your web app is running' <<<"$body"; then status="placeholder"
    elif grep -qi 'Application Error' <<<"$body"; then status="crashed"
    elif [[ "$code" =~ ^[23] ]]; then status="ok"; break
    else status="http $code"; fi
    sleep 5
  done
  printf '%-22s %-12s %4ss  %s\n' "$run" "$status" "$((SECONDS - t0))" "$url"
}

pids=()
while read -r run skills effort port; do
  [[ -n "${*:-}" && "$only" != *" $run "* ]] && continue
  deploy_one "$run" &
  pids+=($!)
done < <(read_runs "$dir/runs.yaml")
wait "${pids[@]}"

# Check every app in parallel; DEPLOY_TIMEOUT (seconds, default 300) per app.
echo
printf '%-22s %-12s %5s  %s\n' RUN STATUS TIME URL
pids=()
while read -r run skills effort port; do
  [[ -n "${*:-}" && "$only" != *" $run "* ]] && continue
  check_one "$run" &
  pids+=($!)
done < <(read_runs "$dir/runs.yaml")
wait "${pids[@]}"
