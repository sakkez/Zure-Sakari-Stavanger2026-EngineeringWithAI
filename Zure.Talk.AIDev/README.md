# Live: Engineering with AI (developers are stronger than ever)

Talk repo. The same game idea is built five times at once, on autopilot: `raw-low`,
`raw-med`, `ecc-med`, `firstmate-med` and `matt-med`. `raw-med` (no skills, medium
effort) is the baseline: against `raw-low` only the thinking effort changes, against
the other three only the skill pack. A hidden Playwright suite and a shared quality
toolchain score every run into one scoreboard table.

- Talk content, run of show and references: [docs/AI-Assisted Development, Live — Talk Reference.md](docs/AI-Assisted%20Development%2C%20Live%20%E2%80%94%20Talk%20Reference.md)
- Slide content and speaker notes: [docs/Presentation.md](docs/Presentation.md); the deck: `python slides/build_deck.py`

## Layout

| Path | What |
| --- | --- |
| `template/` | The reusable harness. Change things here, never in a past talk. |
| `template/runs.yaml` | The default five runs: name, skill pack, effort, port |
| `template/base/` | The shared harness copied into every run: AGENTS.md, PROMPT.md, test hook |
| `template/skills/` | Skill packs, each with a pinned `install.sh`: `raw`, `mattpocock`, `firstmate`, `ecc` |
| `template/shared/acceptance/` | The hidden referee suite |
| `template/talk/` | Per-talk files: `idea.md` (what every run gets), `brief.md` and `product-owner.md` (the stand-in product owner), `run.md` |
| `template/reference/` | A small build of the brief, only for proving the acceptance suite. Never given to a run. |
| `template/shared/quality/` | Quality tools, AI judge and scoreboard builder |
| `scripts/` | `new-talk.sh`, `start.sh`, `scoreboard.sh`, `reset-run.sh`, `reset.sh` (empties the live/ demo folders), plus `azure-setup.sh`, `deploy.sh`, `azure-teardown.sh` |
| `talks/<date-name>/` | One folder per delivery: an honest record of what ran that day |
| `slides/` | `build_deck.py` builds `docs/AI-Assisted Development, Live.pptx` on the Zure template; notes come from `docs/Presentation.md` |

## Running a talk

Run the scripts from a Git Bash terminal. Started from PowerShell, a `.sh` opens in its own window that closes on error, so you never see what went wrong.

```bash
scripts/new-talk.sh 2026-11-05-devconf              # copies base + installs packs per run
scripts/azure-setup.sh 2026-11-05-devconf           # once: plan + five web apps, urls.md, qr/*.png
(cd talks/2026-11-05-devconf/quality && npm install)
(cd talks/2026-11-05-devconf/acceptance && npm install)
# fill in talks/2026-11-05-devconf/run.md (exact model and pack versions)

export CLAUDE_CODE_OAUTH_TOKEN=...                  # from `claude setup-token` (subscription), or ANTHROPIC_API_KEY
scripts/start.sh 2026-11-05-devconf                 # from inside herdr: five agents, one prompt
scripts/deploy.sh 2026-11-05-devconf                # at the timebox: all runs to Azure in parallel
scripts/scoreboard.sh 2026-11-05-devconf --judge    # while the audience plays
scripts/reset-run.sh 2026-11-05-devconf ecc-med after-10min   # if a run stalls
scripts/azure-teardown.sh 2026-11-05-devconf        # after the talk: deletes the resource group
scripts/reset.sh                                    # live/openspec, matt, ecc, firstmate back to just set up
```

Ports are fixed per run in `runs.yaml` (3001–3005). Each run folder is its own git repo.

## Before a real delivery

- Pin each pack (`REF` / `VERSION` in its `install.sh`) and rehearse its install. firstmate is marked TODO: it lists macOS and Linux only and needs gh, jq and treehouse.
- After changing `template/talk/brief.md`, the referee contract in `template/base/AGENTS.md` or the suite, prove the suite against the reference game: `(cd template/shared/acceptance && RUN_DIR=../../reference npx playwright test --repeat-each=3)`.
- In a rehearsal, check each pack's transcript for its Skill calls and each `.steps/driver.log`: a pack nobody drives is a raw run.
- Install quality prerequisites: `pip install lizard`, `docker pull semgrep/semgrep`.
- Run everything in a container or VM. Every run has open permissions.
- Do a full rehearsal, keep its scoreboard as the fallback, and tag checkpoints in each run for `reset-run.sh`.
