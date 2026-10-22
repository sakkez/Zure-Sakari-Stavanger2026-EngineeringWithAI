#!/usr/bin/env bash
# Usage: scoreboard.sh <talk> [--mutation] [--judge]
# For each run: run the hidden acceptance suite against its game,
# run the quality tools, read its cost. Writes talks/<talk>/results/ and scoreboard.md.
set -uo pipefail
source "$(dirname "$0")/_runs.sh"

talk="${1:?usage: scoreboard.sh <talk> [--mutation] [--judge]}"
shift
dir="$(talk_dir "$talk")"
qflags=()
judge=0
for a in "$@"; do
  case "$a" in
    --mutation) qflags+=(--mutation) ;;
    --judge) judge=1 ;;
  esac
done
mkdir -p "$dir/results"

# A tool that is missing scores "—", silently. Install the talk's own tools, and say up
# front which rows will be empty and why.
for tools in acceptance quality; do
  [[ -d "$dir/$tools/node_modules" ]] && continue
  echo "installing $tools tools"
  (cd "$dir/$tools" && npm install --no-audit --no-fund >/dev/null) || echo "WARN: npm install failed in $tools/: its rows will be —" >&2
done
docker info >/dev/null 2>&1 || echo "WARN: Docker is not running: Semgrep findings will be —" >&2
command -v lizard >/dev/null || echo "WARN: lizard is not installed (pip install lizard): Functions over CCN 10 will be —" >&2
(( ${#qflags[@]} )) || echo "note: Mutation score % is opt-in: add --mutation (slow)"

while read -r run skills effort port; do
  rdir="$dir/runs/$run"
  out="$dir/results/${run//\//__}"
  echo "== $run"
  # A pack that builds outside the run (firstmate's clone) brings its work back first.
  [[ -f "$rdir/.agent-collect" ]] && bash "$rdir/.agent-collect"

  # Acceptance: the frozen suite starts the run's own `npm start` per test, on free ports.
  (cd "$dir/acceptance" && RUN_DIR="$rdir" npx --no-install playwright test --reporter=json --output="$out.acceptance" >"$out.acceptance.json" 2>/dev/null)

  PORT="$port" node "$dir/quality/quality.mjs" "$rdir" "${qflags[@]}" >"$out.quality.json" 2>/dev/null
  CLAUDE_CONFIG_DIR="$rdir/.claude-home" npx --yes ccusage@20.0.34 session --json >"$out.cost.json" 2>/dev/null

  started="$(cat "$rdir/.started-at" 2>/dev/null || true)"
  last="$(git -C "$rdir" log -1 --format=%ct 2>/dev/null || true)"
  node -e '
    const fs = require("fs");
    const [out, started, last] = process.argv.slice(1);
    const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
    const a = read(out + ".acceptance.json")?.stats;
    const c = read(out + ".cost.json");
    // ccusage also reads other agents logs (Copilot, Codex) from outside the run: keep Claude only.
    const mine = (c?.session ?? []).filter((s) => s.agent === "claude");
    const sum = (k) => mine.reduce((n, s) => n + (s[k] ?? 0), 0);
    const usd = c ? sum("totalCost") : null;
    fs.writeFileSync(out + ".json", JSON.stringify({
      acceptance: a && a.expected + a.unexpected + a.flaky + a.skipped > 0 ? { passed: a.expected, total: a.expected + a.unexpected + a.flaky + a.skipped } : null,
      quality: read(out + ".quality.json"),
      cost: usd === null ? null : { usd: +usd.toFixed(2), tokens: sum("totalTokens"), outputTokens: sum("outputTokens") },
      minutes: started && last && +last > +started ? Math.round((last - started) / 60) : null,
    }, null, 2));
  ' "$out" "$started" "$last"
  rm -f "$out.acceptance.json" "$out.quality.json" "$out.cost.json"
done < <(read_runs "$dir/runs.yaml")

[[ $judge == 1 ]] && node "$dir/quality/judge.mjs" "$dir"
node "$dir/quality/scoreboard.mjs" "$dir"
