#!/usr/bin/env bash
# Usage: reset.sh [openspec|matt|ecc|firstmate ...] [-y]
# Empties the live demo folders (default: all four) back to their just-set-up state,
# so a new talk starts clean. Lists what goes and asks first, unless -y.
#   openspec   .claude/ (openspec skills, osc, /opsx, context-mode), .gitignore and
#              openspec/config.yaml, with empty specs/ and changes/archive/
#   matt       Pocock's skills in .claude/, CLAUDE.md, docs/agents/ and .agent-steps
#   ecc        ECC's .claude/ and .agent-steps
#   firstmate  the .firstmate clone (projects, state and data cleaned) and its .agent-* files
# A pack whose setup is missing is installed again from template/skills (needs the network).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
live="$root/live"
yes=
names=()
for a in "$@"; do
  case "$a" in
    -y) yes=1 ;;
    openspec|matt|ecc|firstmate) names+=("$a") ;;
    *) echo "usage: reset.sh [openspec|matt|ecc|firstmate ...] [-y]" >&2; exit 1 ;;
  esac
done
(( ${#names[@]} )) || names=(openspec matt ecc firstmate)

shopt -s dotglob nullglob

# What each folder keeps at the top level, and the pack that sets it up.
keep() {
  case "$1" in
    openspec) echo ".claude .gitignore openspec" ;;
    matt) echo ".claude CLAUDE.md docs .agent-steps" ;;
    ecc) echo ".claude .agent-steps" ;;
    firstmate) echo ".firstmate .agent-cwd .agent-steps .agent-collect" ;;
  esac
}
pack() { case "$1" in matt) echo mattpocock ;; ecc|firstmate) echo "$1" ;; esac; }
set_up() {
  case "$1" in
    openspec) [[ -f "$live/openspec/openspec/config.yaml" ]] ;;
    matt) [[ -d "$live/matt/.claude/skills" ]] ;;
    ecc) [[ -d "$live/ecc/.claude" ]] ;;
    firstmate) [[ -d "$live/firstmate/.firstmate/.git" ]] ;;
  esac
}

gone=()
install=()
for n in "${names[@]}"; do
  d="$live/$n"
  mkdir -p "$d"
  if ! set_up "$n"; then
    [[ "$n" == openspec ]] && { echo "live/openspec has no openspec/config.yaml: run openspec init there first" >&2; exit 1; }
    install+=("$n")
  fi
  k=" $(keep "$n") "
  for p in "$d"/*; do
    [[ "$k" == *" $(basename "$p") "* ]] || gone+=("$p")
  done
  case "$n" in
    openspec) for p in "$d"/openspec/*; do
                [[ "$(basename "$p")" == config.yaml ]] && continue
                # specs/ and changes/ holding nothing but .gitkeep files are already empty
                [[ -d "$p" && -z "$(find "$p" -type f ! -name .gitkeep)" ]] && continue
                gone+=("$p")
              done ;;
    matt) for p in "$d"/docs/*; do
            [[ "$(basename "$p")" == agents ]] || gone+=("$p")
          done ;;
  esac
done

fm="$live/firstmate/.firstmate"
fm_dirty=
if [[ " ${names[*]} " == *" firstmate "* && -d "$fm/.git" ]]; then
  fm_dirty="$(git -C "$fm" status --porcelain --ignored | grep -v ' config/$' | cut -c4- | sed 's#^#firstmate/.firstmate/#' || true)"
fi

if (( ${#gone[@]} == 0 && ${#install[@]} == 0 )) && [[ -z "$fm_dirty" ]]; then
  echo "already clean: ${names[*]}"; exit 0
fi
(( ${#gone[@]} )) && printf '  %s\n' "${gone[@]#"$live"/}"
[[ -n "$fm_dirty" ]] && printf '  %s\n' $fm_dirty
(( ${#install[@]} )) && echo "  install: ${install[*]}"
if [[ -z "$yes" ]]; then
  read -r -p "reset these in live/? [y/N] " ok
  [[ "$ok" == [yY] ]] || { echo "nothing changed"; exit 1; }
fi

(( ${#gone[@]} )) && rm -rf "${gone[@]}"
if [[ -n "$fm_dirty" ]]; then
  git -C "$fm" reset --hard --quiet
  git -C "$fm" clean -fdxq -e config
fi
if [[ " ${names[*]} " == *" openspec "* ]]; then
  mkdir -p "$live/openspec/openspec/specs" "$live/openspec/openspec/changes/archive"
  touch "$live/openspec/openspec/specs/.gitkeep" "$live/openspec/openspec/changes/archive/.gitkeep"
fi
for n in "${install[@]}"; do
  bash "$root/template/skills/$(pack "$n")/install.sh" "$live/$n"
done
echo "reset ${names[*]}"
