#!/usr/bin/env bash
# Usage: reset-run.sh <talk> <run> <tag>
# Restores one run (its own git repo) to a rehearsed tag,
# e.g. reset-run.sh 2026-11-05-devconf ecc-med after-10min
set -euo pipefail
source "$(dirname "$0")/_runs.sh"

usage="usage: reset-run.sh <talk> <run> <tag>"
dir="$(talk_dir "${1:?$usage}")"
run="${2:?$usage}"
tag="${3:?$usage}"
rdir="$dir/runs/$run"

git -C "$rdir" rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "no such tag in $run: $tag" >&2; exit 1; }
git -C "$rdir" reset --hard --quiet "$tag"
git -C "$rdir" clean -fdq -e .claude-home -e .firstmate
echo "reset $run to $tag"
