# Skill packs

Each folder is one variant in the skills comparison. `new-talk.sh` runs the pack's
`install.sh <run-dir>` with `CLAUDE_CONFIG_DIR=<run-dir>/.claude-home`, so nothing
is installed globally and no pack leaks into another run.

| Pack | What it is |
| --- | --- |
| raw/ | No skills. The baseline. |
| mattpocock/ | [Matt Pocock's skills](https://www.aihero.dev/skills): a small idea-to-ship flow |
| firstmate/ | [firstmate](https://github.com/kunchenguid/firstmate): one first mate supervising a crew |
| ecc/ | [Everything Claude Code](https://github.com/affaan-m/ECC): a full harness, ~300 skills |

A pack only changes anything when it is driven the way its author intends, so an
installer may also write:

- `.agent-steps`: the prompts a user of the pack would type, one per turn, separated by
  lines holding only `---`. `{{PROMPT}}` stands for `PROMPT.md`. `start.sh` sends the
  first with everyone else's and the rest each time the agent goes idle.
- `.agent-cwd`: where the agent starts, relative to the run.
- `.agent-collect`: a script that brings work built outside the run back into it,
  run by `deploy.sh` and `scoreboard.sh` first.

Questions a pack would put to the user go to the `product-owner` subagent, which every
run gets from the talk's `brief.md`.

| Pack | Steps |
| --- | --- |
| raw | `PROMPT.md` |
| mattpocock | `/grill-with-docs`, `/to-spec`, `/implement` (setup done at install) |
| ecc | `/plan`, `CONFIRM` with the `tdd-workflow` skill, `/code-review` |
| firstmate | one request to the first mate: add the run as a local-only project, ship the task |

Pin each pack (`REF` / `VERSION` at the top of its `install.sh`) before a talk and
record it in `run.md`. Third-party packs are a supply chain: read what you install.
