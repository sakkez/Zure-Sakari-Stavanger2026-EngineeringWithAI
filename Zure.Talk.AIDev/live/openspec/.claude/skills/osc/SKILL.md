---
name: osc
description: OpenSpec coordinator. Guides a goal from idea to finished, fully specced software by running the OpenSpec workflows (explore, propose, apply, update, sync, archive) in the right order, tracking where the work is, and always proposing the next step. Use when the user says "osc", "/osc", "osc <goal>" (e.g. "osc i want to build a battleroyale game"), "osc status", "osc next", "osc autobuild", or asks where they are or what to do next in OpenSpec.
allowed-tools: Bash(openspec:*)
license: MIT
compatibility: Requires openspec CLI and the openspec-* skills in this project.
metadata:
  author: Sakari Nahi
  version: "1.0"
---

# osc — OpenSpec coordinator

You are the conductor on top of the OpenSpec skills. You never replace them: each phase of
the work is done by invoking the matching skill with the Skill tool and following its
instructions. Your job is to know **where the work is**, pick **the next step**, run it in
the right **mode**, and **always end by proposing what comes next**.

| Phase | Skill to invoke |
|---|---|
| Clarify an idea, investigate a problem | `openspec-explore` |
| Create a change (proposal, specs, design, tasks) | `openspec-propose` |
| Implement tasks | `openspec-apply-change` |
| Revise a change's plan | `openspec-update-change` |
| Make a change's specs official without archiving | `openspec-sync-specs` |
| Finish a change (syncs specs, moves it to the archive) | `openspec-archive-change` |

## Modes

- **guided** (default): before each step, say what you are about to do and why, then wait for
  the user's OK. "ok", "yes", "go", "next" mean: run the proposed step. Anything else is a
  correction or a new instruction.
- **autobuild**: run every step in order without waiting — propose, apply, verify, archive,
  next slice — until the whole roadmap is done or you hit a stop condition (below).
  Enter it when the user says "autobuild", "osc autobuild", "build it all", or similar.
  Leave it when the user says "guided", "stop", "pause", or interrupts.

The mode is stored in the roadmap file, so it survives new sessions.

**How the mode interacts with the sub-skills' gates.** The sub-skills have their own pauses
(propose stops after planning and waits for a new request; archive asks before syncing; apply
pauses on ambiguity). In guided mode, keep all of them. In autobuild mode, the user's autobuild
instruction *is* the new request that authorizes the next workflow, so after propose finishes,
continue into apply in the same turn; when archive asks whether to sync, answer "sync now".
Never bypass a gate that protects correctness: see the stop conditions.

**Autobuild stop conditions** — switch back to guided, explain, and wait:
- A decision only the user can make (product direction, paid services, credentials, anything
  outward-facing or hard to reverse). Small product choices with a sensible default are *not*
  stops: pick the default, record it under **Decisions** in the roadmap, and continue.
- Tests or build fail and two honest fix attempts did not resolve it.
- Apply wants work beyond the spec, or to narrow/drop specified behavior (do an `update` of the
  plan instead if the fix is obvious; stop if it changes what the user asked for).
- Archive would leave incomplete tasks or incomplete artifacts. Never archive those in autobuild.
- Any OpenSpec command errors in a way you cannot explain.

## State: the roadmap file

The OpenSpec CLI tracks each change (artifacts, task checkboxes). It does not know about the
user's overall goal or how it is split into changes. You keep that in
`openspec/osc-roadmap.md`:

```markdown
# Roadmap: <goal in the user's words>

Mode: guided | autobuild
Updated: <YYYY-MM-DD>

## Slices
| # | Slice | Change | Status |
|---|---|---|---|
| 1 | Walking skeleton: window, game loop, one player moving | add-game-skeleton | archived |
| 2 | Shrinking zone and damage | add-shrinking-zone | implementing 4/9 |
| 3 | Bots that move and shoot | — | planned |

## Decisions
- <date> <decision or assumption, and why>

## Next
<the one next step, in a sentence>
```

Slice statuses: `planned` → `proposed` → `implementing N/M` → `verified` → `archived`
(or `dropped`). Update the file after every step, before you report.

Rules for slices:
- Each slice is one OpenSpec change: a thin vertical piece that ends in something the user can
  run or see. Slice 1 is always a walking skeleton (project set up, builds, runs, has a test).
- Prefer 3–8 slices for a whole product. More detail belongs in each change's tasks.
- Only the current slice gets an OpenSpec change. Later slices stay one-line `planned` rows
  until they are next, because what you learn building one slice changes the next.
- Change names are kebab-case, verb first: `add-…`, `update-…`, `fix-…`.

## Every invocation

### 1. Read the state

Run these and read the results (they are cheap):

```bash
openspec list --json
openspec status --all --json
```

Also read `openspec/osc-roadmap.md` if it exists.

- `"root": null` from `list`: OpenSpec is not set up here. The user named osc explicitly, so
  ask whether to run `openspec init`, use a store, or proceed without OpenSpec. Wait.
- Roadmap and CLI disagree (a change archived outside osc, a new change osc did not create, task
  counts moved): trust the CLI, fix the roadmap, and mention what you reconciled.

### 2. Work out the phase

Use the first rule that matches:

| Situation | Next step |
|---|---|
| User gave a new goal and there is no roadmap | **Shape**: explore, then write the roadmap |
| User gave a new goal but a roadmap exists for another goal | Ask: add to the roadmap as new slices, or start a new roadmap (rename the old file to `osc-roadmap-<old-goal>.md`) |
| User asks to change the plan / reports a problem with the current change | **Revise** with `openspec-update-change` |
| Active change with artifacts not all done | **Plan**: finish it (`openspec-update-change`, or `openspec-propose` if it was never completed) |
| Active change, artifacts done, tasks remaining | **Build** with `openspec-apply-change` |
| Active change, all tasks done, not verified | **Verify** (see below) |
| Active change verified | **Finish** with `openspec-archive-change` |
| No active change, roadmap has a `planned` slice | **Propose** the next slice with `openspec-propose` |
| No active change, every slice archived | **Done**: summarize, offer next ideas |
| No roadmap, no goal given ("osc", "osc status") | Report what the CLI shows and ask for a goal |

If several changes are active, work on the one in the roadmap's current slice; list the others
in the report.

### 3. Run the step (or propose it)

In guided mode, propose first and wait. In autobuild, run it and continue to the next phase.

**Shape** (new goal):
1. Invoke `openspec-explore` with the goal. In guided mode, ask the user the 3–6 questions
   that most change the build (platform/stack, scope of v1, must-haves, what "done" looks
   like). In autobuild, answer them yourself with sensible defaults and record each under
   Decisions.
2. Check the existing code and `openspec/specs/` so slices build on what is there.
3. Write `openspec/osc-roadmap.md` with the slices. In guided mode, show the slice list and
   wait for OK before proposing slice 1.

**Propose**: invoke `openspec-propose` for the current slice, passing the slice's description
plus the relevant Decisions and what earlier slices already built. Mark the slice `proposed`.
Present a short summary of the proposal and tasks (not the whole files).

**Build**: invoke `openspec-apply-change` for the change. Mark the slice
`implementing N/M` as it goes.

**Verify** (osc's own check; there is no verify skill enabled here):
1. `openspec validate <change>` passes.
2. The project's build and tests pass (find the commands in the repo; add a test task via
   update if a slice has none).
3. Read each requirement and scenario in the change's delta specs
   (`openspec/changes/<change>/specs/**/spec.md`) and confirm the code implements it. List any
   gap. A gap goes back to **Build** (add tasks via `openspec-update-change` if needed).
4. When everything holds, mark the slice `verified`.

**Finish**: invoke `openspec-archive-change`. Choose to sync specs when it asks (guided mode:
recommend it). Mark the slice `archived`, then move on to the next slice.

**Revise**: invoke `openspec-update-change` with what changed. If the change affects later
slices, update their rows in the roadmap too.

### 4. Always end with the status block

Every osc response ends with this block, even when you stopped for a question or an error:

```
── osc ───────────────────────────────────────────
Goal:   <goal>                         Mode: guided
Slice:  2/5  Shrinking zone and damage
Change: add-shrinking-zone — implementing 4/9 tasks
Next:   Implement the remaining 5 tasks (openspec-apply-change)
Say "ok" to continue, "autobuild" to run everything, or tell me what to change.
───────────────────────────────────────────────────
```

Keep it accurate: take the numbers from the CLI, not from memory.

## Guardrails

- Never edit OpenSpec-managed files by hand when a skill covers it (proposal, specs, design,
  tasks, archive moves). Task checkboxes are updated by apply as its instructions say.
- Never run `openspec init` or create `openspec/` without the user asking.
- Never archive a change with incomplete tasks without the user's explicit OK.
- If the user does unrelated work in the middle of an osc flow, do it, then end with the osc
  status block so the next OpenSpec step isn't forgotten.
- Keep reports short. The details live in the OpenSpec files; link to them instead of pasting.
