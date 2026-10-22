#!/usr/bin/env bash
# Sensors: tests + types. Runs after every edit (see .claude/settings.json).
# Prints only what failed, so the agent does not need to rerun anything.
cd "$(dirname "$0")"
[[ -f package.json ]] || exit 0

out="$(npm test --silent 2>&1)" || { echo "TESTS FAILED"; echo "$out" | tail -40; }
if [[ -f tsconfig.json ]]; then
  out="$(npx --no-install tsc --noEmit 2>&1)" || { echo "TYPE ERRORS"; echo "$out" | head -20; }
fi
exit 0
