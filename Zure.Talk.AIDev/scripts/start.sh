#!/usr/bin/env bash
# Usage: start.sh <talk>
# Run from inside herdr. One workspace per run (the agent, with an "app" pane below it).
# Copies the live idea into every run, starts Claude with the run's own config dir,
# then sends every run the same prompt at the same moment.
set -euo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: start.sh <talk>}"
dir="$(talk_dir "$talk")"
# Everything also goes to <talk>/start.log. Started from PowerShell, this runs in its own
# window that closes on exit, so on a failure say where, and wait for Enter first.
exec > >(tee -a "$dir/start.log") 2>&1
echo "== start.sh $talk at $(date '+%F %T')"
trap 'code=$?; if (( code )); then echo "start.sh stopped (exit $code). Log: $dir/start.log"; [[ -t 0 ]] && read -rp "Press Enter to close. "; fi' EXIT
# Each run has its own CLAUDE_CONFIG_DIR, so there is no shared login. Pass one in:
# a subscription token from `claude setup-token`, or an API key, here or in .env.
[[ -f "$ROOT/.env" ]] && source "$ROOT/.env"
if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  auth=(--env "CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN")
elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  auth=(--env "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
else
  echo "set CLAUDE_CODE_OAUTH_TOKEN (run: claude setup-token) or ANTHROPIC_API_KEY" >&2
  exit 1
fi

# Read one field from herdr's JSON reply, e.g. pane_id result.root_pane.pane_id
field() {
  node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      console.log(process.argv[1].split(".").reduce((o, k) => o[k], JSON.parse(s)));
    });
  ' "$1"
}

# A fresh CLAUDE_CONFIG_DIR starts with first-run screens (theme, trust folder,
# bypass warning) that would swallow the prompt. Mark them done for this run.
# An agent that starts below the run (.agent-cwd, as firstmate does) also loads the run's
# own CLAUDE.md from the folder above, which Claude Code asks about as an external import.
seed_config() {
  local home="$1" cwd external="$3"
  cwd="$(cygpath -m "$2" 2>/dev/null || echo "$2")"
  mkdir -p "$home"
  node -e '
    const fs = require("fs"), [home, cwd, external] = process.argv.slice(1);
    const merge = (f, fn) => {
      let j = {}; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    };
    merge(home + "/.claude.json", (j) => {
      Object.assign(j, { hasCompletedOnboarding: true, bypassPermissionsModeAccepted: true });
      j.projects ??= {};
      j.projects[cwd] = { ...j.projects[cwd], hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true };
      if (external === "1") Object.assign(j.projects[cwd], { hasClaudeMdExternalIncludesApproved: true, hasClaudeMdExternalIncludesWarningShown: true });
    });
    merge(home + "/settings.json", (j) => {
      j.theme ??= "dark";
      j.skipDangerousModePermissionPrompt = true;
    });
  ' "$home" "$cwd" "$external"
}

# A run's prompts, one per turn: .agent-steps split on lines holding only "---", with
# {{PROMPT}} replaced by PROMPT.md. Without .agent-steps, PROMPT.md is the one step.
# Writes <rdir>/.steps/1.txt, 2.txt, ...
split_steps() {
  local rdir="$1" prompt f s
  prompt="$(cat "$rdir/PROMPT.md")"
  rm -rf "$rdir/.steps" && mkdir -p "$rdir/.steps"
  if [[ -f "$rdir/.agent-steps" ]]; then
    awk -v d="$rdir/.steps" 'BEGIN { n = 1 } /^---$/ { n++; next } { print > (d "/" n ".txt") }' "$rdir/.agent-steps"
  else
    echo "{{PROMPT}}" > "$rdir/.steps/1.txt"
  fi
  for f in "$rdir"/.steps/*.txt; do
    s="$(cat "$f")"
    printf '%s\n' "${s//"{{PROMPT}}"/"$prompt"}" | tr '\n' ' ' > "$f"
  done
}

# Send steps 2..n, each when the agent finishes its previous turn, as a user of the pack would.
# Prompts go out with MSYS_NO_PATHCONV=1: Git Bash would turn "/plan ..." into a Windows path.
drive() {
  local slug="$1" rdir="$2" n="$3" i
  for ((i = 2; i <= n; i++)); do
    herdr agent wait "$slug" --until idle --timeout 1800000 >/dev/null || { echo "$(date +%T) step $i: never idle, stopped"; return; }
    MSYS_NO_PATHCONV=1 herdr agent prompt "$slug" "$(cat "$rdir/.steps/$i.txt")" >/dev/null
    echo "$(date +%T) sent step $i"
    herdr agent wait "$slug" --until working --timeout 15000 >/dev/null || echo "$(date +%T) step $i: did not start working"
  done
}

started=()
while read -r run skills effort port; do
  rdir="$dir/runs/$run"
  slug="$(run_slug "$run")"
  cp "$dir/idea.md" "$rdir/idea.md"
  cwd="$rdir"
  [[ -f "$rdir/.agent-cwd" ]] && cwd="$rdir/$(cat "$rdir/.agent-cwd")"
  # The stand-in product owner: same brief for every run, in the agent's own project.
  mkdir -p "$cwd/.claude/agents"
  cat "$dir/product-owner.md" "$dir/brief.md" > "$cwd/.claude/agents/product-owner.md"
  seed_config "$rdir/.claude-home" "$cwd" "$([[ -f "$rdir/.agent-cwd" ]] && echo 1)"
  env=(--env "PORT=$port" --env "CLAUDE_CONFIG_DIR=$rdir/.claude-home" "${auth[@]}")

  pane="$(herdr workspace create --cwd "$cwd" --label "$slug" "${env[@]}" --no-focus | field result.root_pane.pane_id)"
  # The app pane below the agent, in the same tab: the agent keeps the top 70%.
  app="$(herdr pane split "$pane" --direction down --ratio 0.7 --cwd "$rdir" "${env[@]}" --no-focus | field result.pane.pane_id)"
  herdr pane rename "$app" app >/dev/null
  # On the command line as well as in settings: an agent started below the run (.agent-cwd)
  # reads the settings of that folder instead.
  model="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).model ?? ""' "$rdir/.claude/settings.json")"
  # Up to 3 minutes to be ready: a pack's startup hooks (ECC's) can take a while on Windows.
  herdr agent start "$slug" --kind claude --pane "$pane" --timeout 180000 -- --effort "$effort" ${model:+--model "$model"} --dangerously-skip-permissions >/dev/null \
    || { echo "$slug never got ready (a dialog open?). Nothing was prompted: answer it, close the run workspaces, and rerun." >&2; exit 1; }
  echo "started $slug: $skills, effort $effort, model ${model:-default}, port $port"
  started+=("$slug=$rdir")
done < <(read_runs "$dir/runs.yaml")

# Every agent must be idle at its input box, not stuck on a dialog.
for entry in "${started[@]}"; do
  slug="${entry%%=*}"
  herdr agent wait "$slug" --until idle --timeout 120000 >/dev/null \
    || { echo "$slug is not ready (a dialog open?). Check its workspace, then rerun." >&2; exit 1; }
done

# Same prompt, same moment, for every run: its first step. Then check each one started,
# and leave a driver sending the rest of a pack's steps (log: <run>/.steps/driver.log).
for entry in "${started[@]}"; do
  rdir="${entry#*=}"
  split_steps "$rdir"
done
for entry in "${started[@]}"; do
  slug="${entry%%=*}"
  rdir="${entry#*=}"
  date +%s > "$rdir/.started-at"
  MSYS_NO_PATHCONV=1 herdr agent prompt "$slug" "$(cat "$rdir/.steps/1.txt")" >/dev/null
done
for entry in "${started[@]}"; do
  slug="${entry%%=*}"
  rdir="${entry#*=}"
  herdr agent wait "$slug" --until working --timeout 15000 >/dev/null \
    || echo "WARN: $slug did not start working. Check its workspace." >&2
  n="$(ls "$rdir"/.steps/*.txt | wc -l)"
  if (( n > 1 )); then
    drive "$slug" "$rdir" "$n" > "$rdir/.steps/driver.log" 2>&1 &
    disown
    echo "$slug: $n steps, driver running"
  fi
done
echo "all runs prompted at $(date +%T). Timebox: 25 minutes."
