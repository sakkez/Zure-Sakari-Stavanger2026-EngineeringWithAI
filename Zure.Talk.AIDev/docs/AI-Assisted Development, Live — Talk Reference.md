# Live: Engineering with AI (developers are stronger than ever) — Talk Reference

Oct 11, 2026 · @Sakari

The simplest current story: specs say what to build, tests prove it, the harness keeps the agent honest, and skills make the whole loop repeatable.

## The narrative

Thesis: writing code is now cheap; the developer's job is defining "done" and building the loop that proves it. That is the line from vibe coding (accept whatever comes back) to what Karpathy named "agentic engineering" in February 2026.

One loop, four steps, each mapped to a talk pillar. Put this on a slide and return to it every time the demo moves to a new step.

1. **Spec** — say *what* and *why*, small and in the problem space. The agent asks you questions before it writes code.
2. **Test (red)** — turn the spec's acceptance criteria into failing tests. Tests are the machine-readable spec.
3. **Build (green) inside a harness** — the agent implements until the tests and other sensors (types, lint, a browser check) go green. You review the diff, not every keystroke.
4. **Capture as a skill** — anything you had to say twice becomes a SKILL.md or an AGENTS.md line, so the next loop starts smarter.

Then loop: the next feature starts at step 1. The audience leaves with one sentence: *write the spec, prove it with tests, fence it with a harness, and keep what you learn as skills.*

**The underlying problem is determinism.** A model is non-deterministic, so everything in the loop is about adding constraints and rules until the output is predictable enough to trust. Skills and the harness are how you get there. Some teams write their own, others install them from the internet; either is fine, as long as you read what you install (see Honest caveats).

## Run of show (45 min)

Assume a 45-minute slot including questions. The audience's game idea comes first, so the six runs start within two minutes and build on autopilot for 25 minutes. Everything up to the results is told while they build, with peeks at what each run is doing. The last part of the talk is the two scorecards.

| Time | Segment | On screen | Key talking point |
| --- | --- | --- | --- |
| 0–1 | Title | Title slide | Most of this happens live |
| 1–3 | Audience idea + kickoff | Type the idea into `idea.md`; `start.sh` starts six agents in herdr; 25:00 slide | The agents need the time more than the intro does |
| 3–8 | Why we're here | Lost the flow, what we gained, two Februaries, our job has changed, the loop, determinism | We've traded deep focus for capacity; our job is moving from writing code to verifying it |
| 8–11 | The two comparisons | Comparisons slide, then herdr | One variable per comparison; two runs share a setup, so their gap is the noise |
| 11–15 | Pillar 1: Spec | Peek: what each skill pack wrote before any code (a spec, a plan, or nothing) | Say what you want, not how to build it |
| 15–19 | Pillar 2: TDD | Peek: which runs wrote tests first, which wrote none | "Use red/green TDD"; watch for agents deleting tests |
| 19–23 | Pillar 3: Harness | firstmate's crew in herdr; each run's own Playwright tests | Agent = model + harness; the hidden suite is the referee |
| 23–28 | Pillar 4: Skills | One SKILL.md from each pack. At 28, time's up: `deploy.sh` and `scoreboard.sh` | About 40 skills vs about 300; skills are a supply chain |
| 28–30 | How we measure | The four layers | Ask AI last, not first |
| 30–33 | Result 1: Effort | Effort scorecard, then the Finnish idiom | What medium thinking buys, and what it costs |
| 33–37 | Result 2: Skills | Skills scorecard; the audience plays the deployed builds via QR | Same model, same prompt, different discipline |
| 37–40 | Close | Business fit, at work, the loop | Write the spec, prove it with tests, fence it with a harness, and keep what you learn as skills |
| 40–45 | Q&A | — | Have the caveats ready; AI dev teams section for "what about at work?" |

### Stage lines and asides

Short beats to drop in where they fit. Suggested placement in brackets.

**Speaking bullets**

- [Hook] DHH on Lex Fridman: we used to think about one problem, focus on it, and drop into flow state.
- [Hook] And now? Show of hands: who has said "just one prompt more"? We work in parallel now, and that is what the six runs on screen look like.
- [Hook] Prime (ThePrimeagen): "the end of an era."
- [The loop + comparisons] Then switch to herdr: "it looks like this."
- [Scoreboard / close] When code is cheap, other things matter more: business fit and use fit. Is this the right thing to build, and does it work for the person using it?
- [Scoreboard / close] Designers are moving from Figma to delivering repos, or at least handing things over through MCP.

**Finnish idioms** (for a Finnish audience, or with a translation for everyone else)

- *Kuin kuseminen saappaisiin pakkasella*: like peeing in your boots in the frost. Warm for a moment, much worse soon after. [Effort result / "speed isn't throughput"]: the run that looked done first but fails the two-player test.
- *Savu seuraa lampaannussijaa*. [placement open]
- *Ryebread maistuu kuoleman pelolta*. [placement open]
- Covid as a problem, from 5 m down to 2 (the Finnish personal-space joke). [placement open; maybe when the audience joins the game]

## Talking points per pillar

### 1. Spec-driven development

- **Definition:** a written spec, not the chat history, is the source of truth; the agent builds and checks against it. GitHub Spec Kit (open-sourced Sept 2025) made the term mainstream, with AWS Kiro and Tessl close behind.
- **Three levels of rigor** (Birgitta Böckeler, Thoughtworks): spec-first, spec-anchored, spec-as-source. Her finding: nearly every tool today is really spec-first. Good framing for "start here."
- **Keep it small:** one to three pages per feature, organized by feature, with an explicit out-of-scope list. A Spec Kit maintainer's rule: the spec defines the *what*, the plan finds the *how*.
- **Planner lesson from Anthropic:** when the planner spelled out implementation details, errors cascaded into the build. Spec the outcome ("real-time multiplayer"), not the transport ("WebSockets on Redis").
- **Tooling-neutral version:** plan mode in Claude Code (explore → plan → code → commit) is spec-first without a framework.
- **Skills do the spec and the SDLC:** more and more, the spec step and the rest of the lifecycle (plan, test, review) are skills rather than a separate tool. [OpenSpec](https://github.com/Fission-AI/OpenSpec) is a lightweight option that colleagues recommend first.

### 2. TDD with agents

- **The one-liner:** Simon Willison's pattern — every good model understands "use red/green TDD" as write tests first, watch them fail, then make them pass.
- **Why it fits:** tests stop agents from writing code that doesn't work or isn't needed, and leave a regression suite behind.
- **Kent Beck:** calls TDD a "superpower" with agents, describes them as an "unpredictable genie," and reports agents deleting or disabling tests to get green. Great live moment if it happens.
- **Nuance from research:** the TDAD paper (Mar 2026) found generic "do TDD" instructions *raised* regressions on small models, while telling the agent *which* tests a change affects cut them by 70%. Point: give context, not ceremony.

**TDD by the numbers.** There is no like-for-like before/after survey: Stack Overflow has never asked about TDD, and no 2025–26 survey measures how many developers practice it now.

- **Before AI — claimed vs practiced:** in Diffblue's 2020 survey, 41% said their organization had fully adopted TDD, but only 8% wrote tests before code at least 80% of the time. Best single slide stat.
- **Before AI — measured, not asked:** Beller et al. (2015) tracked developers in their IDEs. Half didn't test at all, TDD was rare, and developers spent about a quarter of their time on tests while believing it was half.
- **QA view:** PractiTest's State of Testing found 23% of organizations following TDD in 2024, up from 18% a year earlier.
- **After AI — adjacent data:** DORA 2025 found 62% of developers who write tests use AI to help. JetBrains 2026: 90% of professional developers use coding agents at least weekly, 68% daily.
- **Stage line:** "Before AI, about 8% of us actually wrote tests first. Now test-first is one line to an agent, so the cost that kept it at 8% is mostly gone." Admit nobody has measured the new rate, then poll the room: who wrote tests first before 2024, and who asks an agent to now?

Sources: [Diffblue 2020 report (via TechRepublic)](https://www.techrepublic.com/article/test-driven-development-talked/) · [Beller et al. (via Never Work in Theory)](https://neverworkintheory.org/2021/09/12/developer-testing-in-the-ide.html) · [PractiTest 2024](https://prnewswire.co.uk/news-releases/40-of-companies-embrace-ai-in-testing-according-to-practitests-2024-state-of-testing-report-302085122.html) · [DORA 2025 (via Google Cloud)](https://cloud.google.com/discover/how-test-driven-development-amplifies-ai-success) · [JetBrains 2026 (via ADTmag)](https://adtmag.com/articles/jetbrains-survey-finds-ai-coding-agents-becoming-routine-developer-tools.aspx)

### 3. Harnesses

- **Formula:** agent = model + harness. OpenAI's Ryan Lopopolo named "harness engineering" in Feb 2026; his team shipped \~1M lines with no hand-written code.
- **Mental model** (Böckeler, martinfowler.com): guides steer *before* the agent acts (AGENTS.md, skills, conventions); sensors give feedback *after* (tests, linters, structural tests, hooks).
- **Make the app legible to the agent:** OpenAI made the UI, logs and metrics directly readable by Codex. For the demo, that is Playwright driving the game.
- **Separate the judge:** Anthropic's long-running harness used planner, generator and evaluator agents; a skeptical evaluator was easier to tune than self-critique.
- **"Give the agent a map, not a 1,000-page manual"** — keep AGENTS.md / CLAUDE.md short.
- **Keep tool output out of context:** [context-mode](https://context-mode.com) wraps shell commands and web fetches, indexes their output, and lets the agent query it instead of reading whole walls of HTML or build logs. Emmz's recommendation, quoted: "the second plugin i recommend (after OpenSpec) is context-mode.com."
- **Code search as a sensor:** [Sourcegraph](https://sourcegraph.com) and [Sourcebot](https://www.sourcebot.dev) give the agent one searchable view across many repos, often over MCP, instead of cloning and grepping each one.

### 4. Skills

- **What:** a folder with a SKILL.md (name + description + instructions), optionally scripts and references. Released as an open standard at agentskills.io in Dec 2025; now supported by Claude, Codex, Gemini CLI, Copilot, Cursor and others.
- **Progressive disclosure:** only names and descriptions load up front; the full skill loads when relevant. That is why many skills don't bloat context.
- **Show a methodology as skills:** packs like Matt Pocock's skills, Everything Claude Code and obra/superpowers package spec → plan → TDD → build → review as installable skills; firstmate goes one level up and packages the crew that runs them. The talk compares three of them live (see The comparisons).
- **Small vs big:** about 40 focused skills (Pocock) against about 300 (ECC). Progressive disclosure makes the big pack possible; the scorecard shows whether it helps.
- **Capture your own:** anything you correct twice becomes a SKILL.md. In Q&A: "which of these packs would you have written yourself?"

## Live demo plan

Take the audience's idea, but steer it into a fixed shape: a small real-time browser game with a server that owns game state. That keeps every run inside the 25-minute timebox whatever they suggest, and gives the acceptance suite something fixed to test.

**Prepared before the talk (show it, don't build it):**

- One shared base harness used by every run: a short AGENTS.md (stack, port, "server is authoritative", "state lives in memory only", "never delete tests", "no human is available, so write your assumptions to ASSUMPTIONS.md"), a test hook, and one shared `PROMPT.md`. The fixed stack (TypeScript on Node, npm, Vitest, Playwright) is what makes the quality tools comparable across runs.
- **The game is ephemeral.** All state lives in server memory, with no database or external services, and a restart resets everything. That keeps the build small and makes deployment a single Node process.
- **Every run tests itself with Playwright.** The prompt asks for two-player end-to-end tests, and "done" means its own `npm run test:e2e` passes. The hidden acceptance suite is still the referee: a run that passes its own tests but fails the hidden ones has tested the wrong thing, which is a finding in itself.
- Playwright's Chromium installed once (shared browser cache or baked into the container image), so six runs don't each download browsers on the venue network.
- Each skill pack installed and pinned to a commit or version in its run folder, never globally (see The comparisons).
- The hidden acceptance suite (two Playwright players) and the quality toolchain installed, with Docker images pulled, so `scoreboard.sh` runs offline.
- An API key and a per-run `CLAUDE_CONFIG_DIR`, so each run's plugins stay separate and its token cost can be read afterwards.

**Safety nets:**

- Rehearsal scorecards from the same setup (same base, packs, model). If a run stalls or the venue network dies, show last night's scorecard and say so.
- A git tag per run at rehearsal checkpoints; `reset-run.sh` jumps a run forward.
- A pre-recorded 60–90s clip per comparison as a last resort.
- Rehearse with the exact model and tool versions you'll use; pin them in `run.md`.
- Local network/hotspot plan for the audience join; a QR code slide with the deployed URLs.

**Good moments to engineer:**

- Two runs share a config (`effort/medium` and `skills/raw`). When they come out different, that is non-determinism, live. It makes the determinism point better than any slide.
- Low effort looks done first, then fails the two-player test.
- A skill pack wants to grill the user and nobody answers. Read its ASSUMPTIONS.md aloud.
- An agent deletes or weakens a test to get green. The quality check counts it.
- Playwright catches a desync between two tabs that unit tests missed.

## The comparisons

The talk shows two comparisons. Each changes one variable and holds everything else equal: same audience idea, same base harness, same prompt, same model and version, same start time, same 25-minute timebox, all on autopilot with no human gates.

| Run | Skill set | Thinking effort | Port | In comparison |
| --- | --- | --- | --- | --- |
| `effort/low` | raw | low | 3001 | Effort |
| `effort/medium` | raw | medium | 3002 | Effort |
| `skills/raw` | raw | medium | 3003 | Skills |
| `skills/mattpocock` | Matt Pocock's skills | medium | 3004 | Skills |
| `skills/firstmate` | firstmate | medium | 3005 | Skills |
| `skills/ecc` | Everything Claude Code | medium | 3006 | Skills |

`effort/medium` and `skills/raw` have the same configuration on purpose. The gap between them is your noise floor: a difference between skill packs smaller than that gap is not a difference. To save cost, drop `skills/raw` and reuse `effort/medium` as the skills baseline.

### Comparison 1: thinking effort, low vs medium

The model's own reasoning-effort setting, not the setup effort of the earlier narrative. Call it "thinking effort" on stage. High is left out: it would not finish inside the timebox, and that is worth one sentence on stage. [Spending your effort](https://claude.dev/blog/spending-your-effort/) explains the trade-off between cost, latency and quality.

- **Set it per run:** `effortLevel` in the run's `.claude/settings.json`, or `--effort low` on launch. Both runs are raw, with no skills, so effort is the only variable.
- **The question for the audience:** what does medium buy you, and is it worth the time and tokens? Show cost and wall-clock time next to quality, not only quality.

### Comparison 2: skill packs

Same model at medium effort. Only the skill set changes.

| Variant | What it is | Install (pin the version) | Watch for |
| --- | --- | --- | --- |
| **Raw** | No skills. Base harness only. | — | The baseline: how far AGENTS.md, a hook and a good prompt get you |
| **Matt Pocock's skills** ([aihero.dev/skills](https://www.aihero.dev/skills), [repo](https://github.com/mattpocock/skills)) | An opinionated idea-to-ship flow, about 40 skills: `/grill-me`, `/to-spec`, `/to-tickets`, `/tdd`, `/implement-spec`, `/code-review` | `npx skills@latest add mattpocock/skills` writes editable files into the project | The grilling skills expect a human. On autopilot, check ASSUMPTIONS.md |
| **firstmate** ([kunchenguid/firstmate](https://github.com/kunchenguid/firstmate)) | An "agent distro", not a skill pack: you talk to one first mate, which dispatches crewmates into their own worktrees and supervises them | Clone the repo and start the agent inside it; set the project to `local-only` mode | Different in kind: orchestration rather than method. Its crewmates can appear as herdr panes, which is a good visual |
| **Everything Claude Code (ECC)** ([affaan-m/ECC](https://github.com/affaan-m/ECC)) | A full harness: about 70 agents, 300 skills, hooks and rules, with a plan → test → implement → review → verify loop | `npx ecc-universal@<pinned> setup`, or the plugin. Use one method only | Size: does 300 skills help or cost context? Check where its installer writes |

Fairness rules for the skills comparison:

- **Install per run, never globally.** Plugins and installers that write to `~/.claude` would leak into the other runs. Give each run its own `CLAUDE_CONFIG_DIR` (and ideally its own container).
- **Same prompt for all.** `PROMPT.md` says "build this; use whatever workflow your installed skills provide." Do not tune the prompt per pack. Firstmate is the exception: its prompt goes to the first mate, which passes it on.
- **No human answers questions.** Every pack runs on autopilot. A pack that relies on asking the user is at a disadvantage, and that is a finding to say out loud, not a bug in the setup.
- **Read what you install.** Third-party skills, hooks and scripts are a supply chain. Pin a commit and record it in `run.md`.

### Measuring quality

"Which one is better" needs an answer the audience trusts. Ask AI last, not first. The scorecard puts deterministic tool results first, the AI judge's opinion second, and keeps them in separate columns. Never sum everything into one number: show the columns and let the room weigh them.

**1. Does it work? (the referee)**

- **Hidden acceptance suite:** two Playwright players doing join, move, sync and disconnect, run against each run's port. Score: tests passed out of N. No run has seen these tests. This is the headline column.
- **The audience plays:** a QR code per build, and a quick show of hands for which one felt right. It is not data, but it is fun, and it is the "use fit" point.

**2. Is the code good? (deterministic tools, same config for every run)**

| Signal | Tool | Why it matters |
| --- | --- | --- |
| Type errors | `tsc --noEmit` with a shared strict config | Code that "looks right" but isn't |
| Lint findings | ESLint with *our* shared config, not the run's own | Same rules for everyone. A run that switched rules off still gets counted |
| Complexity | `lizard` (cyclomatic complexity, functions over a threshold) | Maintainability, per function |
| Duplication | `jscpd` (% duplicated lines) | Copy-paste generation |
| Size | `lizard` (lines of code) | More code is not more done; compare against acceptance passes |
| Own Playwright tests | Their e2e suite's pass count (`playwright test`) | Did it prove two-player play itself? Compare with the hidden suite |
| Own unit tests | Their test count, pass rate and coverage (`vitest --coverage`) | Did it leave a regression suite behind? |
| **Test strength** | **Stryker mutation testing** on the server logic | Do their tests catch bugs, or only exist? The best single "quality" number. It is slow, so start it as soon as a run is done |
| Tests deleted or skipped | `git diff` against the run's own history; count of `.skip` and `.only` | The Kent Beck moment, measured |
| Security | Semgrep (`p/typescript`), `npm audit` | Hidden defects, risky dependencies |
| Dependencies | Count of runtime dependencies | Supply chain surface |
| One-glance rating (optional) | SonarQube Community in Docker | A maintainability A–E rating the audience already understands. It ties back to the Sonar survey in the caveats |

**3. What did it cost?**

- Wall-clock time to "done", or "did not finish" at the timebox.
- Tokens and cost per run: `ccusage` reads each run's own `CLAUDE_CONFIG_DIR`.
- Turns and tool calls, if you want one more column.

**4. What does an AI reviewer think? (opinion, labelled as such)**

- **Blinded:** copy each run's source to folders A–F with a hidden mapping, so the judge doesn't know which pack wrote what.
- **A rubric, not "which is best":** spec adherence, server authority, readability, test meaningfulness, each scored 1–5 with a one-line reason.
- **A different model as judge** from the one that built, three samples per run, report the median.
- Show its scores next to the tool results. Where they disagree is a talking point.

**On stage:** the effort scorecard is a two-column table; the skills scorecard is four columns. Bold the best value in each row. Lead with acceptance passes, mutation score and cost; everything else is detail for Q&A.

## Repo layout

One repo split into a reusable template and one folder per talk. `new-talk.sh` copies the base harness into each run folder and installs that run's skill pack, so every delivery starts from the same harness and past runs stay untouched. Inside a talk, `cd runs/<comparison>/<variant>` and launching the agent is the whole setup. Show `ls -a` of `skills/raw` and `skills/ecc` side by side: the difference is the skills.

```
Zure.Talk.AIDev/
├── README.md                # how to run a talk
├── docs/                    # this reference, the slide content, the deck
├── template/
│   ├── runs.yaml            # default runs: comparison/variant, skill set, effort, port
│   ├── talk/                # run.md and idea.md templates for each talk
│   ├── base/                # the shared harness copied into every run
│   │   ├── AGENTS.md        # stack, port, rules; CLAUDE.md points here
│   │   ├── PROMPT.md        # the one prompt every run gets
│   │   ├── checks.sh        # tests + lint, run by the hook after every edit
│   │   └── .claude/settings.json
│   ├── skills/              # skill packs, each with a pinned install.sh
│   │   ├── raw/
│   │   ├── mattpocock/
│   │   ├── firstmate/
│   │   └── ecc/
│   └── shared/
│       ├── acceptance/      # hidden 2-player Playwright suite (the referee)
│       └── quality/         # quality.sh, judge.sh, shared lint/tsconfig, rubric
├── scripts/
│   ├── new-talk.sh          # new-talk.sh 2026-11-05-devconf [runs.yaml]
│   ├── start.sh             # start.sh <talk> → herdr workspaces, all agents
│   ├── scoreboard.sh        # acceptance + quality per run → scoreboard.md
│   ├── reset-run.sh             # restores a talk's runs to a rehearsed tag
│   ├── azure-setup.sh       # once: App Service plan + one web app per run, QR codes
│   ├── deploy.sh            # at the timebox: zip-deploy every run in parallel
│   └── azure-teardown.sh    # after the talk: delete the resource group
├── talks/
│   ├── 2026-11-05-devconf/
│   │   ├── runs.yaml        # which runs, and each one's skill set and effort
│   │   ├── idea.md          # that audience's idea, typed live
│   │   ├── run.md           # model, tool and pack versions; scorecards
│   │   ├── acceptance/      # frozen copy of the suite used that day
│   │   ├── quality/         # frozen copy of the quality config used that day
│   │   └── runs/
│   │       ├── effort/{low,medium}/
│   │       └── skills/{raw,mattpocock,firstmate,ecc}/
│   └── 2027-02-12-…/
└── slides/               # build_deck.py + icons → docs/…Live.pptx on the Zure template
```

**The archive is a talking point.** When you rerun the same comparisons months later, `talks/` shows how the scorecards moved as models and packs changed. That comparison only holds if every `run.md` records exact model, tool and pack versions; `new-talk.sh` creates it with those fields to fill in.

Changes to the harness go into `template/`, never into a past talk folder. That way each dated folder is an honest record of what ran on that day.

Practical details:

- **Ports:** fixed per run in `runs.yaml` (3001–3006) for local runs and the scoreboard.
- **Deployment: Azure App Service, not Vercel.** Vercel runs serverless functions: no long-lived WebSocket server and no shared memory between requests, so a server-authoritative in-memory game would force every run onto a third-party realtime service and skew the comparison. App Service runs a normal Node process. Before the talk, create one Linux plan (B1) with six web apps (`<talk>-effort-low` … `<talk>-skills-ecc`), WebSockets and ARR affinity on, startup command `npm start`; App Service sets `PORT`, which AGENTS.md already reads. At the end of the timebox, `deploy.sh` zip-deploys all six in parallel (a minute or two); it ships the working tree as it is, including uncommitted work, without touching the run's history. `azure-setup.sh` does the setup and writes `urls.md` and a QR code per run; `azure-teardown.sh` deletes the resource group. The URLs are fixed, so the QR codes can be printed in advance. Delete the plan after the talk.
- **Git:** six agents committing to one repo at once collide on the git index. Each run folder is its own git repo (`new-talk.sh` runs `git init`), which also gives the quality check a history to diff for deleted tests. firstmate creates its own worktrees inside its run.
- **Autopilot containment:** every run has open permissions. Run them in a container or VM, scoped to their own folder. Open permissions on your presentation laptop are a real risk.
- **Isolation:** each run gets its own `CLAUDE_CONFIG_DIR` (`<run>/.claude-home`), so no pack's plugins, hooks or memory leak into another run. So there is no shared login: `start.sh` passes in a subscription token from `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`), or an API key (`ANTHROPIC_API_KEY`) as the alternative.
- **Rehearsal tags:** tag the talk at rehearsal checkpoints (`after-10min`, …) so `reset-run.sh` can jump a run forward if it stalls.

## Showing it in herdr

[herdr](https://github.com/ogulcancelik/herdr) suits this well. It is a terminal multiplexer built for coding agents, with workspaces, tabs and panes, and a per-workspace state dot that shows which agent is working, blocked or done. On autopilot the dots should stay busy; one that turns to "blocked" is a pack waiting for a human who isn't coming.

**Layout: one workspace per run, the same two tabs in each.**

| Tab | Contents | When you show it |
| --- | --- | --- |
| agent | The coding agent session for that run | Every pillar segment |
| app | Dev server on the run's port | When the audience plays |

Plus a seventh workspace, **stage**, holding the scoreboard and the two Playwright player windows.

**How it plays on stage:**

- Workspaces are named after the runs (`effort-low`, `skills-ecc`, …), so switching is legible from the back of the room.
- Peek at a different run per pillar: Spec shows Pocock's PRD next to raw's nothing, TDD shows who has tests, Harness shows firstmate's crew as extra panes.
- herdr keeps agents running after you detach, and `start.sh` drives it through its CLI: `workspace create`, `agent start --kind claude`, `agent prompt`.
- Install herdr's agent integration (`herdr integration install claude`) so it detects agent state reliably.
- Test font size and pane count on the venue projector; six agents never fit legibly on one screen, so switch workspaces instead of tiling.

## AI dev teams: after the demo

What happens when a team adopts this at work. Useful for Q&A and for customer conversations.

1. **Excitement:** people see they can ship faster, and they do.
2. **Then costs rise.** More agents, more parallel sessions and longer runs mean more tokens. The fix is not fewer agents but less context per agent. Look at the team's harness and ways of working:
   - **Tests output diagnostics about the test only.** A failing test reports exactly what failed and why, so other agents don't have to rerun the suite or read unrelated logs.
   - **One consolidated view of the repos over MCP** (e.g. Sourcegraph or Sourcebot) instead of every agent cloning and exploring each repo.
   - **Pre-process tool output** (e.g. context-mode) so build logs and web pages get queried, not read in full.
   - **Pick thinking effort per task:** low for mechanical edits, high for planning and review (see The comparisons).

## Honest caveats

Naming these up front makes the talk more credible, and they are the likely Q&A questions.

- **Productivity evidence is messy.** METR's 2025 trial found experienced devs 19% *slower* with AI while believing they were 20% faster. Its 2026 follow-up leaned toward a speedup but METR called it unreliable, partly because developers refused to work without AI for the control group.
- **Speed isn't throughput.** Sonar's 2026 survey: 88% of devs report a negative AI impact on tech debt; 53% cite code that looks right but hides defects. This is the argument *for* the loop.
- **"Waterfall strikes back."** Hacker News critics say heavy SDD is waterfall with markdown. Answer: tiny specs, minutes-long loops, update the spec when the build teaches you something.
- **Procedure prompts can backfire.** The TDAD result: generic TDD instructions increased regressions; targeted context helped.
- **Skills are a supply chain.** Third-party skills can carry risky instructions or scripts; read them like any dependency.
- **Harnesses age.** Each harness component encodes an assumption about what the model can't do yet; Anthropic dropped parts of its own harness as models improved.

## Reference library

Starred rows are the ones to read first; together they cover all four pillars.

| Pillar | Type | Reference | Use it for |
| --- | --- | --- | --- |
| Spec | Article ★ | [Understanding SDD: Kiro, spec-kit, and Tessl — Böckeler](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | The three-level taxonomy and a hands-on critique |
| Spec | Paper | [Spec-Driven Development: From Code to Contract (arXiv 2602.00180)](https://arxiv.org/abs/2602.00180v1) | Academic citation for spec-first / anchored / as-source |
| Spec | Radar | [Thoughtworks Tech Radar: SDD](https://www.thoughtworks.com/radar/techniques/spec-driven-development) | Neutral industry view, incl. oversized-spec warnings |
| Spec | Forum / blog | [SDD vs vibe coding: waterfall?](https://glukhov.org/ai-devtools/vibe-coding/spec-driven-development-vs-vibe-coding/) | Summary of the HN "Waterfall Strikes Back" debate |
| Spec | Video | [Using SDD for Production Workflows — Erik Hanchett, AWS (AI Engineer WF 2026)](https://ai.engineer/speakers/redacted-username) | 18-min Kiro walkthrough to borrow structure from |
| TDD | Guide ★ | [Red/green TDD — Simon Willison, Agentic Engineering Patterns](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/) | The one-line prompt pattern you'll use on stage |
| TDD | Podcast | [TDD, AI agents and coding with Kent Beck — Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent) | "Superpower", "genie", test-deleting agents |
| TDD | Essay | [Augmented Coding: Beyond the Vibes — Kent Beck](https://kentbeck.com/summaries/augmented-coding-beyond-the-vibes/) | Real B+ tree project built with TDD + agents |
| TDD | Paper | [TDAD: Test-Driven Agentic Development (arXiv 2603.17973)](https://arxiv.org/abs/2603.17973) | Context beats procedure; regressions data |
| Harness | Article ★ | [Harness engineering — OpenAI, Ryan Lopopolo](https://openai.com/index/harness-engineering/) | Origin of the term; agent-legible apps |
| Harness | Video | [Harness Engineering talk — Ryan Lopopolo (AI Engineer)](https://ai.engineer/talks/harness-engineering) | 46-min talk version |
| Harness | Article | [Harness engineering for coding agent users — Böckeler](https://martinfowler.com/articles/harness-engineering.html) | Guides vs sensors diagram for your slides |
| Harness | Article | [Harness design for long-running apps — Anthropic](https://anthropic.com/engineering/harness-design-long-running-apps) | Planner / generator / evaluator; Playwright as QA |
| Harness | Paper | [Harness Engineering: a source-code study of eleven systems](https://www.emergentmind.com/papers/2609.00006) | Seven harness subsystems; skills vs MCP adoption |
| Harness | Docs | [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md) | Explore → plan → code → commit; verification |
| Skills | Spec ★ | [agentskills.io](https://agentskills.io/) | The open standard and progressive disclosure |
| Skills | Repo | [obra/superpowers](https://github.com/obra/superpowers) | Whole loop as installable skills |
| Skills | Repo ★ | [Matt Pocock's skills](https://www.aihero.dev/skills) | Comparison 2: small, opinionated idea-to-ship flow |
| Skills | Repo | [firstmate](https://github.com/kunchenguid/firstmate) | Comparison 2: one first mate supervising a crew of agents |
| Skills | Repo | [Everything Claude Code](https://github.com/affaan-m/ECC) | Comparison 2: a full harness with ~300 skills and ~70 agents |
| Evidence | Tool | [Stryker mutation testing](https://stryker-mutator.io/) | Scorecard: do the generated tests catch bugs? |
| Spec | Repo | [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Lightweight SDD as skills/commands; colleagues' first pick |
| Harness | Tool | [context-mode](https://context-mode.com) | Indexes shell/fetch output so the agent queries it instead of reading it |
| Harness | Tool | [Sourcegraph](https://sourcegraph.com) · [Sourcebot](https://www.sourcebot.dev) | Cross-repo code search for agents (MCP) |
| Framing | Blog | [Spending your effort — claude.dev](https://claude.dev/blog/spending-your-effort/) | Low / medium / high reasoning effort comparison |
| Framing | Article | [Agentic Engineering — Addy Osmani](https://addyosmani.com/blog/agentic-engineering/) | Vibe coding vs agentic engineering slide |
| Framing | News | [Vibe coding is passé — The New Stack](https://thenewstack.io/vibe-coding-is-passe/) | Karpathy's Feb 2026 term, for the opening hook |
| Evidence | Research | [METR: changing our productivity experiment design](https://conffab.com/?p=10163) | The caveats slide |

## Sources

Beyond the reference library above:

- [Spec Kit and SDD overview (DEV Community)](https://dev.to/8080_ai/spec-driven-development-in-agile-teams-a-2026-playbook-for-ai-platforms-57km) — Sonar 2026 survey figures, Spec Kit commands
- [SDD in 2026: guide and tool comparison](https://codemyspec.com/blog/spec-driven-development) — Spec Kit origin
- [SDD habits](https://www.questera.ai/blogs/spec-driven-development-habits) — spec length and out-of-scope advice
- [Spec Kit talk quotes, AI Native DevCon 2026](https://tessl.io/registry/ainativedev/aidevcon-2026-ldn/files/talk-graziano-spec-driven-development/quotes.md) — what vs how, thin slices
- [Anthropic harness write-up summary](https://www.mejba.me/anthropic-long-running-agent-harness/) — planner over-specification lesson
- [Agent Skills open standard (Unite.AI)](https://www.unite.ai/anthropic-opens-agent-skills-standard-continuing-its-pattern-of-building-industry-infrastructure) — Dec 18, 2025 release
- [Agent Skills overview (Strapi)](https://strapi.io/blog/what-are-agent-skills-and-how-to-use-them) — supporting platforms
- [Superpowers workflow docs](https://mintlify.com/obra/superpowers/concepts/workflow)
- [OpenAI harness engineering (InfoQ)](https://www.infoq.com/news/2026/02/openai-harness-engineering-codex) — \~1M lines figure
- [METR 2026 update commentary — Rob Bowley](https://blog.robbowley.net/2026/04/04/metrs-developer-productivity-research-2026-update/)
- [Generator-evaluator harness notes](https://understandingdata.com/posts/generator-evaluator-harness-design/) — harness assumptions decay
