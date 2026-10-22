#!/usr/bin/env bash
# Matt Pocock's skills, copied into the run as editable project skills.
# Equivalent to `npx skills@latest add mattpocock/skills`, but pinned and non-interactive.
# Most of them are user-invoked only (disable-model-invocation), so the run is driven
# through the flow a user would type: grill, spec, implement. See .agent-steps below.
set -euo pipefail
REF="${REF:-49dd158}"   # main on 2026-10-16; re-pin before the talk
run="${1:?usage: install.sh <run-dir>}"

tmp="$(mktemp -d)"
git clone --quiet https://github.com/mattpocock/skills "$tmp"
git -C "$tmp" checkout --quiet "$REF"
mkdir -p "$run/.claude/skills"
# Every folder holding a SKILL.md is one skill, wherever the repo keeps it.
find "$tmp" -name SKILL.md -not -path '*/node_modules/*' | while read -r f; do
  cp -r "$(dirname "$f")" "$run/.claude/skills/"
done
version="mattpocock@$(git -C "$tmp" rev-parse --short HEAD): $(ls "$run/.claude/skills" | wc -l) skills"
rm -rf "$tmp"

# What /setup-matt-pocock-skills writes for a solo repo with no remote: a local-markdown
# tracker, default triage labels, single-context domain docs. A user runs it once per
# repo before the talk, so it is done here rather than on the clock.
setup="$run/.claude/skills/setup-matt-pocock-skills"
mkdir -p "$run/docs/agents"
cp "$setup/issue-tracker-local.md" "$run/docs/agents/issue-tracker.md"
cp "$setup/triage-labels.md" "$run/docs/agents/triage-labels.md"
cp "$setup/domain.md" "$run/docs/agents/domain.md"
cat >> "$run/CLAUDE.md" <<'MD'

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
MD

# The prompts a user types, one per turn. start.sh sends the next when the agent goes idle.
cat > "$run/.agent-steps" <<'STEPS'
/grill-with-docs {{PROMPT}} I am not available: put each round of questions to the product-owner subagent and take its replies as my answers. Stop when the frontier is empty.
---
/to-spec Check the seams with the product-owner subagent instead of me.
---
/implement the spec you just wrote in .scratch/. Then finish the task: say DONE when `npm run test:e2e` passes.
STEPS
echo "$version"
