#!/usr/bin/env bash
# Usage: new-talk.sh <yyyy-mm-dd-name> [runs.yaml]
# Copies template/ into talks/<name>/: the base harness into every run, plus that
# run's skill pack (installed into the run, never globally). NO_INSTALL=1 skips packs.
# MODEL=<exact id> pins the runs' model and records it in run.md (default claude-opus-5-5).
set -euo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: new-talk.sh <yyyy-mm-dd-name> [runs.yaml]}"
runs_file="${2:-$ROOT/template/runs.yaml}"
model="${MODEL:-claude-opus-5-5}"
dest="$ROOT/talks/$talk"

[[ -e "$dest" ]] && { echo "exists: $dest" >&2; exit 1; }
[[ -f "$runs_file" ]] || { echo "not found: $runs_file" >&2; exit 1; }

mkdir -p "$dest/runs" "$dest/results" "$dest/quality"
cp "$runs_file" "$dest/runs.yaml"
cp "$ROOT/template/talk/idea.md" "$dest/idea.md"
# The product owner's brief and instructions; start.sh puts them in every run.
cp "$ROOT/template/talk/brief.md" "$ROOT/template/talk/product-owner.md" "$dest/"
# The referee's sources only; node_modules and test results stay behind.
mkdir -p "$dest/acceptance"
(cd "$ROOT/template/shared/acceptance" && cp -r package.json package-lock.json playwright.config.ts fixtures.ts specs README.md "$dest/acceptance/")
find "$ROOT/template/shared/quality" -maxdepth 1 -type f -exec cp {} "$dest/quality/" \;

rows=""
while read -r run skills effort port; do
  installer="$ROOT/template/skills/$skills/install.sh"
  [[ -f "$installer" ]] || { echo "unknown skill pack: $skills" >&2; exit 1; }
  dir="$dest/runs/$run"
  mkdir -p "$dir"
  cp -r "$ROOT/template/base/." "$dir/"
  node -e '
    const fs = require("fs"), f = process.argv[1];
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    s.effortLevel = process.argv[2];
    s.model = process.argv[3];
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
  ' "$dir/.claude/settings.json" "$effort" "$model"
  printf 'RUN=%s\nSKILLS=%s\nEFFORT=%s\nPORT=%s\n' "$run" "$skills" "$effort" "$port" > "$dir/.run.env"

  git -C "$dir" init --quiet
  git -C "$dir" add -A
  git -C "$dir" commit --quiet -m "base harness"
  pack="(not installed)"
  if [[ "${NO_INSTALL:-}" != 1 ]]; then
    if pack="$(CLAUDE_CONFIG_DIR="$dir/.claude-home" bash "$installer" "$dir" | tail -1)"; then
      git -C "$dir" add -A
      git -C "$dir" commit --quiet --allow-empty -m "install $skills"
    else
      echo "WARN: $skills install failed for $run" >&2
      pack="(install failed)"
    fi
  fi
  echo "run $run: $skills $pack, effort $effort, port $port"
  rows+="| $run | $pack | $effort | $port | | | |"$'\n'
done < <(read_runs "$runs_file")

commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
awk -v talk="$talk" -v date="$(date +%F)" -v commit="$commit" -v model="$model" -v rows="${rows%$'\n'}" '
  { gsub(/{{TALK}}/, talk); gsub(/{{DATE}}/, date); gsub(/{{COMMIT}}/, commit); gsub(/{{MODEL}}/, model) }
  /{{RUN_ROWS}}/ { print rows; next }
  { print }
' "$ROOT/template/talk/run.md" > "$dest/run.md"

echo "created $dest"
echo "next: (cd $dest/quality && npm install), (cd $dest/acceptance && npm install), fill in run.md, then scripts/start.sh $talk"
