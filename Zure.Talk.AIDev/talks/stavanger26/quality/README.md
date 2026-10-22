# Quality toolchain

The same tools and the same config for every run, so the scorecard compares runs, not configs.
`new-talk.sh` freezes a copy into each talk. Install once per talk: `npm install` in the talk's `quality/`.

| Script | What it does |
| --- | --- |
| `quality.mjs <run> [--mutation] [--no-semgrep]` | Deterministic metrics for one run as JSON. Unmeasured is `null`, never 0 |
| `judge.mjs <talk> [samples]` | Blinded AI review against `rubric.md`; median of N samples. Set `JUDGE_MODEL` |
| `scoreboard.mjs <talk>` | Builds `scoreboard.md` from `results/`, one table per comparison |

Called by `scripts/scoreboard.sh`; you rarely run them directly.

Needs, besides `npm install` here: Python with `pip install lizard` (complexity, size),
Docker with `semgrep/semgrep` pulled (security), and each run's own `vitest` for its tests.
Mutation testing (Stryker) is slow: pass `--mutation` and start it as soon as a run is done.

Optional, for a one-glance A–E rating: SonarQube Community in Docker plus `sonar-scanner`.
Not wired in; add it if the audience knows Sonar.
