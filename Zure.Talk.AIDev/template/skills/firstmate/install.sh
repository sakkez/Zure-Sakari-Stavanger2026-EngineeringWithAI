#!/usr/bin/env bash
# firstmate: an agent distro. The agent runs inside a firstmate clone (the first mate),
# adds the run as a local-only project under .firstmate/projects/game, and ships the
# task through crewmates in their own worktrees and herdr tabs.
set -euo pipefail
REF="${REF:-5f2b81bc}"   # main on 2026-10-15; re-pin before the talk
run="${1:?usage: install.sh <run-dir>}"

git clone --quiet https://github.com/kunchenguid/firstmate "$run/.firstmate"
git -C "$run/.firstmate" checkout --quiet "$REF"
echo ".firstmate" > "$run/.agent-cwd"
# The crew runs as herdr tabs, next to the other runs (docs/herdr-backend.md).
mkdir -p "$run/.firstmate/config"
echo herdr > "$run/.firstmate/config/backend"

# What the captain says. local-only +yolo: no remote or PRs, and green work lands without
# waiting for the captain, who is not there.
cat > "$run/.agent-steps" <<STEPS
Ahoy. Add the local git repo at $(cygpath -m "$run" 2>/dev/null || echo "$run") as project "game", local-only +yolo: no remote, no PRs, nothing published, and land green work without asking me. Then ship this task in it. I am not available: questions for me go to the product-owner subagent. The task: {{PROMPT}}
STEPS

# The landed work is in firstmate's clone, not the run. deploy.sh and scoreboard.sh run
# this first to bring it back.
cat > "$run/.agent-collect" <<'SH'
#!/usr/bin/env bash
# Fast-forward the run to what firstmate landed in its clone of it.
run="$(cd "$(dirname "$0")" && pwd)"
clone="$run/.firstmate/projects/game"
[[ -d "$clone/.git" ]] || { echo "firstmate: no clone at $clone, nothing landed" >&2; exit 0; }
git -C "$run" pull --quiet --ff-only "$clone" HEAD
SH
echo "firstmate@$(git -C "$run/.firstmate" rev-parse --short HEAD)"
# TODO (rehearsal): firstmate lists macOS and Linux; check it on Windows Git Bash, or run
# this pack in WSL. Its toolchain check wants gh, jq and treehouse.
