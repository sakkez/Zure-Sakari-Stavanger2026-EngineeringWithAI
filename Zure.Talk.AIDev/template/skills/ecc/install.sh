#!/usr/bin/env bash
# Everything Claude Code: agents, skills, hooks, rules and command shims.
# Installs the core profile into the run's ./.claude (target claude-project), so nothing
# lands in ~/.claude. The guided `setup` is interactive and failed unattended; this does not.
# Its hooks merge into the run's settings.json, next to the base checks.sh hook.
set -euo pipefail
VERSION="${VERSION:-2.2.3}"   # pinned; check the ECC README for the current one
run="${1:?usage: install.sh <run-dir>}"

cd "$run"
npx --yes "ecc-universal@$VERSION" install --target claude-project --profile core --enable-hooks >/dev/null

# ECC's "starting a new feature" flow: /plan (waits for CONFIRM), the tdd-workflow
# skill, then /code-review. One prompt per turn; start.sh sends the next when idle.
cat > "$run/.agent-steps" <<'STEPS'
/plan {{PROMPT}} I am not available: put open questions to the product-owner subagent and have it approve the plan instead of me.
---
CONFIRM. Build it with the tdd-workflow skill, following the plan and AGENTS.md.
---
/code-review Fix what it finds. Then finish the task: say DONE when `npm run test:e2e` passes.
STEPS
echo "ecc@$VERSION: core profile"
