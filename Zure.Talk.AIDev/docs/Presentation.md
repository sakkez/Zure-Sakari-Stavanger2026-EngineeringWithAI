# Live: Engineering with AI (developers are stronger than ever) — Slides

Slide content and speaker notes for the 45-minute version (about 40 minutes of talk plus Q&A). Built for PowerPoint: **On slide** is everything the audience reads, **Visual** is what the slide shows, and **Notes** go in the speaker notes.

Rules this deck follows: one idea per slide, a few words at most, big type, no bullet lists on stage. When an image or a number says it, the slide has nothing else. Slide text reads like something a person would say, not like a slogan: full sentences without a closing full stop, never a row of clipped two-word sentences. You are the presentation; the slides only set the beat.

The talk opens with why (the idiom, the bill, the gauntlet loop) and the process: spec, implement, QA, deploy. The five agents build the game in the background, and everything up to the QA results is told while they build.

Slides that don't fit the four steps are kept in the appendix after the takeaways.

Live-demo slides are marked **[LIVE]**: switch to herdr or the browser, and come back to the slide after.

---

## 1. Our job has changed

**On slide:** Our job has changed

**Visual:** Large black text alone on a white background.

**Notes:**
One thing is certain: our job has changed. In the past, when we coded, we got into a state called flow. A single problem consumed all our focus and effort, we got into the flow of fixing and solving it, and it was magnificent.
Now we've lost that flow. Engineering with AI, developing with AI, or just vibe coding, has changed our jobs so that there's no more flow. There are parallel tracks of implementation, and you as the expert jump from agent to agent, from terminal to terminal. While an agent is working, you may feel a little useless, even though you're delivering all the time. So while it builds, you fill that time with something else: speccing, reviewing, or spinning up another agent so it can cook something more. And then you have two tracks to follow.

---

## 2. Silver bullet

**On slide:** I wish I had a silver bullet

**Visual:** Large black text alone on a white background. To come: many screenshots of YouTube speakers who are pushing our craft forward with AI, added around the text by hand.

**Notes:**
I don't have the answer. I wish I had a silver bullet, a clean story for all of you about what the future is, how you should work, and how you should build the thing you're building. Unfortunately I don't have the answer, and neither do these people.

---

## 3. Peeing your pants in winter

**On slide:** Peeing your pants in winter

**Visual:** Large black text alone on a white background, like the two slides before it.

**Notes:**
All I know is that vibe coding, one-shotting, is like the Finnish saying about peeing your pants in winter: it warms you for a while, but in the end it freezes the important bits. That's what speed without verification feels like. In Sonar's 2026 survey, 88% of developers reported that AI had a negative effect on tech debt, and 53% pointed to code that looks right but hides defects. And quality isn't the only thing that catches up with you later. The bill does too.

---

## 4. Title

**On slide:** ● LIVE
Engineering with AI
(developers are stronger than ever)
Sakari Nahi · Zure

**Visual:** Zure dark title layout with the colour blobs. Above the title, a red "● LIVE" badge like a newscast caption.

**Notes:**
Hi, I'm Sakari from Zure. Most of the next 40 minutes happen live: five AI agents are going to build the same thing at the same time, and at the end we'll measure which of them did best. If anything on screen was prepared in advance, I'll tell you.

---

## 5. 185k€

**On slide:** 185k€
one colleague's tokens, January to August

**Visual:** The number, very large, with the caption under it, on dark. Under the caption, small and muted: about 23k€ a month.

**Notes:**
Here's one number from home. A colleague of mine spent about 185,000 euros' worth of tokens from January to August. That's eight months, so roughly 23,000 euros a month, from one person. Nobody was being careless, which is the point: without looking at what goes into the context, this is where it ends up. Every token you feed the agent costs money, and you pay for it again on every call that follows. Managing the context is managing the cost, and we'll come back to how.

---

## 6. The gauntlet loop

**On slide:** Loop until a harsh critic is wowed
Matt Shumer · Claude of Duty

**Visual:** Left, a dark card with the key lines of Shumer's prompt in monospace: fan out sub-agents, /loop on each item, a separate sub-agent checks it visually, a really harsh critic, don't stop until it is utterly wowed, compare side by side blind. Right, the loop: "builders" into "harsh critic", with a dashed arrow back labelled "not AAA yet: keep going". Under it, in cyan: 3.59 → 5.05 out of 10, and "blind A/B: the real Call of Duty won every time". Source line at the bottom: github.com/mshumer/Claude-of-Duty.

**Notes:**
So where do tokens like that go? Into loops like this one. One way to get quality out of an agent is to give it another agent whose only job is to say no. Matt Shumer tried it as far as it goes. His whole prompt was one paragraph: build a first-person shooter at the level of the latest Call of Duty, in Three.js, fan out sub-agents, loop on each part, and have a separate, really harsh critic check every part visually, side by side and blind against the real game, and don't stop until it is utterly wowed. That is the gauntlet loop.
What came out is about 55,000 lines over eleven subsystems, with no art assets at all: every texture, mesh and sound is generated from code. And he is honest about the result. The critics' scores went from 3.59 to 5.05 out of 10, and in the blind comparison every critic in every round still picked the real Call of Duty. A critic that is never satisfied keeps the loop running, which is the point, and also the bill.
Two lessons from his write-up fit this talk. First, sequential passes with one owner per coupled problem beat parallel fan-out clearly: six agents each owning a folder kept breaking each other's assumptions, and one owner moved the score twice as much and cut the defects from 66 to 26. Second, the best fix came from an agent contradicting its own brief, because the critics had been describing the symptom, not the cause. Keep that in mind when we look at firstmate's crew.

---

## 7. The process

**On slide:** The process we always had, with new techniques

1. **Spec**: say what to build and why, before any code exists. *Spec-driven development, context engineering.*
2. **Implement**: the agent builds in small steps, inside guides and sensors. *Harness engineering, context engineering.*
3. **QA**: prove it works with tests and numbers, not vibes. *Agentic TDD, mutation testing, critic agents.*
4. **Deploy**: put it in front of real people, and watch them and the bill. *Harness engineering, cost and context control.*

The terms:
- **Spec-driven development**: the spec, not the chat, is the source of truth the agent builds from and is checked against.
- **Context engineering**: choosing what goes into the model's window, and keeping everything else out.
- **Harness engineering**: building the guides (rules, skills) and sensors (tests, linters, hooks) around the model.
- **Agentic TDD**: the agent writes a failing test first, then code until it passes. The tests say when it's done.

Footer: Harness and skills run through all four: anything you had to say twice becomes a skill.

**Visual:** Four columns, left to right, each headed by a numbered cyan node and the phase name, joined by arrows. Under each name, the one-line definition in grey, then its techniques in cyan. Below a hairline, four matching columns define the terms: the term in bold, its definition in grey. The footer line in muted grey. Labelled The process.

**Notes:**
This is the process the rest of the talk follows, and it's the one we always had: spec, implement, QA, deploy. What's new is who does each step, and what keeps them honest. Spec: say what you want and why, before any code exists. Implement: the agent builds, inside a harness of guides and sensors. QA: prove it works, with numbers rather than vibes. Deploy: put it in front of real people, and watch the bill. The harness and the skills aren't a step of their own; they run through all four, and skills are how anything you had to tell the agent twice gets kept for next time.
We'll take the four in order, and while we do, five agents go through the same process live.

---

## 8. Spec (section)

**On slide:** 01 / Spec / Say what to build and why, before any code exists

**Visual:** Section header on the dark blue gradient: a big cyan 01, the phase name in large white type under it, and the line in grey below.

**Notes:**
First step: the spec. Before an agent writes a line, we agree on what we're building and why. This is where context engineering starts, because the spec is the first and most important thing the agent reads.

---

## 9. Say what you want

**On slide:** Say what you want, not how to build it

**Visual:** Dark statement slide with the blue gradient, labelled 01 · Spec.

**Notes:**
A spec says what to build and why, and leaves the how to the build. Anthropic found that when their planner spelled out the implementation, its mistakes cascaded into everything after it. "Real-time multiplayer" is a spec, while "WebSockets on Redis" is a guess about the solution. Birgitta Böckeler describes three levels, spec-first, spec-anchored and spec-as-source, and finds that almost every tool today is really spec-first. More and more, the spec step is itself a skill, like OpenSpec or Pocock's grill-me and to-spec.

---

## 10. OpenSpec

**On slide:** OpenSpec makes the spec step a handful of commands

**Visual:** A left-to-right flow of five rounded nodes joined by arrows, each with its command in monospace and a short caption under it:
`/opsx:explore` (understand the problem and the code) → `/opsx:propose` (write the change: proposal.md, specs/, design.md, tasks.md) → `/opsx:apply` (build the tasks) → `/opsx:verify` (check the build against the spec) → `/opsx:archive` (file the finished change under changes/archive).
Four small file icons fan out under the propose node. A thin arrow curves from archive back to explore, labelled "next change". One step before the flow, a small grey node: `openspec init`, once per project. Install line in small type at the bottom: `npm install -g @fission-ai/openspec@latest`. Labelled 01 · Spec.

**Notes:**
OpenSpec is one of those spec skills, and its process fits on one line. You set it up once with openspec init, which installs its commands into your agent. Then every change goes the same way. Explore first: the agent maps the problem and reads the code. Propose writes the change down as plain markdown, a proposal, the spec changes, a design and a task list, and that's the moment you review it, before any code exists. Apply builds the tasks, verify checks that what got built matches the spec, and archive files the finished change away, so the specs folder stays a readable record of how the system works. It's spec-first in Böckeler's terms, with the specs kept around afterwards.
[LIVE peek: which runs wrote a spec without being asked? Compare Pocock's spec with the raw run, which has none.]

---

## 11. Implement (section)

**On slide:** 02 / Implement / The agent builds, inside guides and sensors

**Visual:** Section header on the dark blue gradient: a big cyan 02, the phase name in large white type under it, and the line in grey below.

**Notes:**
Second step: implement. This is where the agents spend most of the talk, and where harness engineering does its work: the rules and skills that steer the agent, and the tests and checks that tell it when it went wrong.

---

## 12. Agent = model + harness

**On slide:** Agent = model + harness

**Visual:** The equation, large, with "harness" in cyan. Labelled 02 · Implement.

**Notes:**
Ryan Lopopolo at OpenAI coined "harness engineering", and his team shipped about a million lines of code without writing any of it by hand. All five runs today use the same model, so the harness is the only thing we're varying.

---

## 13. Five runs [LIVE]

**On slide:**
Five agents with the same idea, prompt and model, and no human in the loop
raw-low · raw-med · ecc-med · firstmate-med · matt-med

**Visual:** Five run tiles in one row, each with its name and port (3001–3005). raw-med has a cyan border and the label "baseline". A bracket under raw-low and raw-med reads "effort"; a bracket under raw-med and the three pack runs reads "skill pack".

**Notes:**
Here's what the agents are doing. Each run's name says what it gets: a skill pack, or raw for none, and a thinking effort, low or medium.
raw-med, in cyan, is the baseline: no skills, medium thinking effort. Compare it with raw-low and only the effort changes. Thinking effort is how hard the model reasons before it answers. I left out high because it wouldn't finish in the time we have, which tells you something too.
Compare the baseline with the other three and only the skill pack changes: Everything Claude Code, firstmate, and Matt Pocock's skills.
Every run is one sample, so small gaps can be chance. Keep that in mind when we read the scoreboard.
[Switch to herdr.] This is what it looks like: one workspace per run, and the dots show who's working and who's stuck. On autopilot, a stuck dot means a skill pack is waiting for a human who isn't coming.

---

## 14. What it costs

**On slide:** Every step up in intelligence costs more per task
slopalytics.com · data from Artificial Analysis

**Visual:** A screenshot of slopalytics.com's "Cost vs intelligence" chart: intelligence index against cost per task on a log scale, one line per model with a dot per reasoning level, Opus 5.5 at the top right. Beside it, in cyan: Opus 5.5, $0.55 a task at low effort, $5.98 at max.

**Notes:**
Thinking effort has a price. Slopalytics plots every model's score on the Artificial Analysis intelligence index against what one task costs, with a dot for each reasoning level. Each line climbs and then flattens: the last few points of intelligence are the expensive ones. Opus 5.5, the model building our games, costs about 55 cents a task at low effort and about six dollars at max, more than ten times as much, and the full index run at max cost them about 9,000 dollars. So effort isn't free, and it's one of the things we're comparing today: one of the five runs uses low effort, the rest medium. Keep this chart in mind when we get to the results.

---

## 15. Guides and sensors

**On slide:**
Guides, before it acts: AGENTS.md · skills · conventions
Sensors, after it acts: tests · types · lint · the browser

**Visual:** Two columns, each with a cyan icon (a compass for guides, a gauge for sensors).

**Notes:**
Böckeler has a useful way to think about a harness. Guides steer the agent before it acts: AGENTS.md, skills and conventions. Sensors tell it how it did afterwards: tests, linters, hooks and a browser check. Keep the guides short and give the agent a map rather than a thousand-page manual.
Every run here tests itself with Playwright, playing its own game as two players. On top of that there's a hidden test suite that none of the agents has seen, which acts as the referee at the end.
[LIVE peek: firstmate's crew showing up as extra herdr panes.]

---

## 16. State machines

**On slide:** Or make the process a hard rule instead of asking nicely
Statewright · Stately

**Visual:** A state machine left to right: plan (read-only tools) → edit (file edits) → test (test commands only) → done, with a dashed arrow from test back to edit labelled "red: back to edit, 3 tries". Each state has its allowed tools as small chips under it. Bottom right, in cyan: a 13.8 GB local model, failing → 10 of 10, with "5 SWE-bench tasks, vendor's figures" under it. Labelled 02 · Implement.

**Notes:**
Guides ask the agent to behave: AGENTS.md, skills, conventions. State-based harnesses such as Statewright and Stately take the other route and make the process a hard rule. Each state says which tools the model may use, how many tries it gets, and where it may go next, and that's enforced at the protocol level, not in the prompt. Planning gets read-only tools; testing gets a shell, but only for test commands. So the agent can't edit code before it has read it, can't declare victory without running the tests, and can't be talked out of the process.
For us, with a frontier model, it's an option rather than a must. Opus mostly follows a good AGENTS.md already, so the gain is repeatable, auditable runs rather than raw capability. Where it really pays off is local models. Statewright's headline result is a 13.8 GB local model that failed a SWE-bench task and then solved it 10 times out of 10 inside the state machine. That's the vendor's own run on five tasks, so treat it with care, and it doesn't rescue a model that's too small to hold the context. But if you develop on local models, for cost or because your code can't leave the building, structure is how you buy back the reliability that parameters gave you.
The trade-off is rigidity: a strict workflow can deadlock, and real problems don't follow a neat flow. The middle ground is a state machine for the overall workflow and the safety gates, with the model reasoning freely inside each state.

---

## 17. 40 vs 300

**On slide:**
~40 skills · Matt Pocock
~300 skills · ECC
firstmate: 1 first mate → a crew

**Visual:** Two big numbers side by side on dark, ECC's in cyan, with the firstmate line under them. Labelled 02 · Implement.

**Notes:**
A skill is just a folder with a SKILL.md file, and it has been an open standard since December 2025. Only the names and descriptions load up front, and the full skill loads when it's relevant, which is why a pack of 300 skills can fit at all.
The three packs take very different approaches. Pocock's is a focused flow that goes from grilling you about the idea to a spec, tickets and TDD. ECC tries to include everything, with about 70 agents, hooks and rules. firstmate isn't really a skill pack: you talk to one first mate, and it runs a crew of agents, each in its own worktree.
Whatever you install, remember that skills are a supply chain, and read them the way you'd read any dependency.

---

## 18. How each run is driven

**On slide:** Each pack runs the way its author meant it to

| Run | What is installed | What the agent is told, turn by turn |
| --- | --- | --- |
| raw | Nothing but AGENTS.md | The idea, once |
| ecc | ECC core profile: skills, agents, hooks | `/plan` → `CONFIRM` + tdd-workflow → `/code-review` |
| firstmate | A firstmate clone, the first mate | One request: add the game as a project and ship it; the crew does the rest |
| matt | Pocock's skills, setup done in advance | `/grill-with-docs` → `/to-spec` → `/implement` |

Every question for a human goes to a product-owner agent

**Visual:** The table above on a light layout, one row per pack, the commands in monospace with cyan arrows between turns. Under it, a small product-owner icon with a dotted line to every row. Labelled 02 · Implement.

**Notes:**
A skill pack only changes anything if you use it the way it's meant to be used, so each run is driven the way its author tells you to drive it. The raw runs get the idea once and nothing else. ECC gets its own flow for a new feature: plan, confirm the plan, build it test-first, then review. firstmate gets one sentence, as if you were talking to the first mate, and it hands the work to a crew, each in its own worktree; you'll have seen those show up as extra panes. Pocock's gets the three commands you'd type yourself: grill me about the idea, write the spec, implement it. A small script sends the next command whenever the agent goes quiet.
These packs all expect a human to answer questions, and on autopilot nobody does. So every run gets a product-owner agent that knows the full rules. It only answers specific questions, three at a time, and never hands over the rules wholesale. A pack that asks good questions learns the game; one that guesses doesn't.

---

## 19. Fold the output

**On slide:** Most of what an agent reads is tool output it only needed one line of
context-mode.com

**Visual:** A long test log scrolling into a funnel, and one short line coming out the other side into the model. Beside it, the full log dropping into an archive box labelled "read back by ID". Under it, one number in cyan: 331k → 76k tokens per call, a 30-step session. Labelled 02 · Implement.

**Notes:**
Before we talk about finding code, look at where the tokens actually go. In a long session most of the context isn't code at all: it's test runs, logs and JSON the agent asked for and needed one line of. And because the whole conversation goes back to the model on every call, you pay for that log again on every step that follows.
Context Mode sits between the agent and the model API and folds that output before the model reads it. The full output is archived, so the agent can read it back by ID if it turns out to need it. It also keeps facts across sessions instead of compacting them away, and it can check tool calls against your own rules before they run. You install it with one npx command, and it works by changing Claude Code's base URL.
Their own measurements, on Claude Code with Opus 5.5: a 30-step session went from about 331,000 tokens per call to about 76,000, and across 168 paired runs, 155 were cheaper, with every task still passing in both arms. Those are the vendor's numbers, so measure on your own work. Keeping the noise out of the context is half of the story. The other half is reading less in the first place.

---

## 20. Search, not read

**On slide:** An agent that can search the code understands it with far fewer tokens
Sourcebot · Sourcegraph

**Visual:** Two halves. Left, "reading": an agent opening file after file, with a tall token meter filling up. Right, "searching": one query into an index that spans many repositories, a few precise hits coming back, and a short token meter. Along the bottom, the two tools with one line each: Sourcebot, self-hosted code search with an MCP server for your agent; Sourcegraph, every repository indexed, with an MCP server that gives precise code intelligence. Labelled 02 · Implement.

**Notes:**
Context is the agent's working memory, and every token in it costs money and attention. Without a search tool, an agent finds its way the slow way: it greps, opens a file, opens the next one, and pays for every line it reads, and it only sees the one repository it's sitting in. Give it a search index instead, and "where is this defined, who calls it, how did the other team solve this" is one call that returns a handful of exact hits. That means fewer tokens, less noise in the context and fewer wrong guesses. In Böckeler's terms, search is a guide.
Two tools do this. Sourcebot is self-hosted: one Docker container, your code never leaves your own deployment, and it's free for up to five users. Its MCP server gives Claude Code or Cursor context across every repository in the organisation, and you can also ask it questions in plain English and get answers with citations. Sourcegraph indexes all of your repositories, and its MCP server gives agents precise code intelligence and exact, exhaustive search; their own pitch is "make every token count". It also does Deep Search, plain-English questions with grounded answers.
[Time's up. Run deploy.sh and scoreboard.sh.]

---

## 21. QA (section)

**On slide:** 03 / QA / Prove it works, with numbers rather than vibes

**Visual:** Section header on the dark blue gradient: a big cyan 03, the phase name in large white type under it, and the line in grey below.

**Notes:**
Third step: QA. The agents say they're done; now we find out. Agentic TDD, hidden acceptance tests, mutation scores and a critic agent: different ways of asking the same question, does it actually work?

---

## 22. Our job has changed

**On slide:** Code has become cheap, and our job is now verifying its quality

**Visual:** Dark layout with the blue gradient, the second half of the sentence in light cyan. Labelled 03 · QA.

**Notes:**
Writing code costs almost nothing now. What still costs something is knowing that the code is right: deciding what "done" means and building a loop that proves it. As experts, we're spending less of our time typing code and more of it verifying quality.

---

## 23. 8%

**On slide:** 8%
wrote tests first, before AI
Diffblue developer survey, 2020

**Visual:** The number, very large, with the caption and source under it. Labelled 03 · QA.

**Notes:**
In 2020, 41% of organisations said they had fully adopted test-driven development, but only 8% of developers actually wrote their tests first most of the time. Writing tests first was simply too expensive for most of us. Now it's one line to an agent, so the cost that kept it at 8% has mostly disappeared. Nobody has measured the new number yet, so let's do it here: who wrote tests first before 2024, and who asks an agent to do it now?

---

## 24. Red, green

**On slide:** "Use red/green TDD."
Simon Willison

**Visual:** The quote with a red and a cyan dot above it, and the red blob on the right.

**Notes:**
Simon Willison noticed that every good model understands that one line: write the tests, watch them fail, then make them pass. Kent Beck calls TDD a superpower when you work with agents, and describes the agent as an unpredictable genie; he has watched agents delete tests just to get to green. There's a nuance from research, too. The TDAD paper found that generic "do TDD" instructions made small models worse, while telling the agent which tests a change affects cut regressions by 70%. Context helps more than ceremony.
[LIVE peek: which runs have written tests, and has anyone deleted one?]

---

## 25. How do we know?

**On slide:** How do we know which one is better?
Does it work? · Is the code any good? · What did it cost? · What does an AI reviewer think?

**Visual:** Four stacked layers with icons; the AI reviewer layer is outlined rather than filled, to show it comes last.

**Notes:**
To answer "which one is better" in a way you can trust, we ask the AI last, not first.
First, does it work? We count how many of each run's own Playwright tests pass, and then run the hidden two-player suite that none of them has seen. A run that passes its own tests but fails the hidden ones has tested the wrong thing.
Second, is the code any good? We run real tools with the same configuration for every run: strict types, our lint rules, complexity, duplication and Semgrep. We also run mutation testing, where Stryker changes the code on purpose and checks whether the run's tests notice. That's the best single answer to whether the tests are real.
Third, what did it cost, in tokens, dollars and minutes?
Fourth, what does a blinded AI reviewer think? It uses a rubric and a different model from the builder, and we take the median of three passes. Its scores sit in their own rows and are labelled as opinion.

---

## 26. Effort results [LIVE]

**On slide:** What did more thinking buy us?

**Visual:** Scorecard with five columns, one per run (raw-low, raw-med, ecc-med, firstmate-med, matt-med), and rows for acceptance, mutation score, cost and minutes. The raw-low and raw-med columns are in full colour and the other three are greyed out. Values are dashes until filled in; the best value in each row goes in cyan.

**Notes:**
[Fill in from scoreboard.md, or show it live.] One scoreboard for all five runs; for now, look at the first two. So what did medium thinking buy us, and what did it cost? Look at cost next to quality rather than quality alone. If the low-effort run looked finished first but failed the two-player test, remember the boots.

---

## 27. Skills results [LIVE]

**On slide:** Which skill pack did best?

**Visual:** The same five-column scorecard as slide 26, now with raw-low greyed out and raw-med, ecc-med, firstmate-med and matt-med in full colour. raw-med keeps its cyan "baseline" label.

**Notes:**
[Fill in from scoreboard.md.] The same scoreboard, now the other four columns: same model, same prompt, same effort, and a different discipline. Compare each pack with the raw-med baseline. Each run is one sample, so treat a small gap as a tie. Then ask whether 300 skills helped or just used up context, and which pack got stuck waiting for a human.

---

## 28. Deploy (section)

**On slide:** 04 / Deploy / Put it in front of real people, and watch the bill

**Visual:** Section header on the dark blue gradient: a big cyan 04, the phase name in large white type under it, and the line in grey below.

**Notes:**
Last step: deploy. Working on my laptop isn't the finish line. We play the games, and talk about what this way of working costs and where it fits in real business work.

---

## 29. Play it [LIVE]

**On slide:** Grab your phone and play one of them

**Visual:** Five QR codes in a row, each labelled with its run and port. Generated by azure-setup.sh into the talk's qr/ folder. Labelled 04 · Deploy.

**Notes:**
Scan one of the codes, find a neighbour and play. Afterwards, a quick show of hands: which one felt right? That isn't data, but it's the part the tools can't measure. [For a Finnish room: two players per game suits us fine, since we like our personal space. Covid only took us from five metres down to two.]

---

## 30. Business fit

**On slide:** When code is cheap, what matters is whether it fits the business and the people using it

**Visual:** Dark layout with the photo of two colleagues on the right.

**Notes:**
Once code is cheap, other questions become more important: is this the right thing to build, and does it actually work for the person using it? Designers are already moving from Figma to delivering repos, or at least handing their work over through MCP. The bottleneck is moving from writing code to judgement.

---

## 31. At work

**On slide:** What happens at work
You ship faster → The bill grows → So you cut context

**Visual:** Three icons in a row with arrows between them: a rocket, coins and scissors.

**Notes:**
Here's what tends to happen when a team adopts this. First comes the excitement, because you really do ship faster. Then the token bill arrives. The answer isn't fewer agents but less context per agent: tests that print only what failed, so other agents don't have to rerun everything; one searchable view across your repos over MCP, with something like Sourcegraph or Sourcebot; tools like context-mode that index command output instead of pouring it into the context; and choosing the thinking effort per task, low for mechanical edits and higher for planning and review. You've just seen what that trade-off looks like.

---

## 32. Takeaways

**On slide:** Takeaways
Spec what you want, not how to build it
Let the agent implement inside a harness
Prove it with QA you can measure
Deploy it, and watch what it costs

**Visual:** The process ring from slide 7 with all four nodes lit, on dark, and the four sentences beside it, numbered like the nodes.

**Notes:**
Four things to take home, one per step. Spec: say what you want and why, keep it small, and let a tool like OpenSpec or a grilling skill draw it out of you. Implement: the model matters less than the harness around it, so give the agent guides before it acts and sensors after, and watch its context, because that's where the money goes. QA: measure, don't trust: hidden acceptance tests, mutation scores and cost side by side, with an AI reviewer last. Deploy: put it in front of real people, and keep an eye on the bill; 185,000 euros in eight months is what happens when nobody does. And whatever you had to tell an agent twice, keep as a skill. Thank you.

---

## Appendix

### A1. Questions

**On slide:** Questions?
Sakari Nahi · Zure

**Visual:** Zure dark title layout with the colour blobs, like slide 3.

**Notes:**
The likely questions have appendix slides: does AI actually make us faster, and isn't spec-driven development just waterfall again?

### A2. We've lost something

**On slide:** We've lost something: the flow

**Visual:** Dark layout with the photo of hands on a keyboard on the left.

**Notes:**
DHH said this on Lex Fridman: we used to sit with one problem, think about it, focus on it, and eventually drop into flow. For many of us that was the best part of the job. ThePrimeagen calls what's happening now the end of an era, and I think he's right. Hands up if you've told yourself "just one more prompt" at eleven at night. We don't sit with one problem any more. We juggle several agents at once, and the deep focus is mostly gone.

### A3. What have we gained?

**On slide:** What have we gained?

**Visual:** Light layout with the green-blue blob on the right.

**Notes:**
So what did we get in exchange? The ability to deliver much more than one person could before. Right now five builds are running in parallel on this laptop, and that would have been a team's week of work not long ago. The question for the rest of this talk is how to make that extra capacity something you can trust.

### A4. Two Februaries

**On slide:**
Feb 2025 — vibe coding
Feb 2026 — agentic engineering

**Visual:** A two-point timeline, with the 2026 point highlighted.

**Notes:**
In February 2025 Karpathy gave us "vibe coding": you accept whatever comes back and see whether it runs. A year later, in February 2026, he named the grown-up version "agentic engineering". The tools are the same; what changed is the discipline around them, and that discipline is what this talk is about.

### A5. Determinism

**On slide:** What we're really after is determinism

**Visual:** Dark layout with the purple blob on the right.

**Notes:**
Underneath all of this is one problem: a model is non-deterministic, and every step of that loop exists to add enough constraints and rules that the output becomes predictable enough to trust. Skills and harnesses are how we get there. Some teams write their own and some install them from the internet, and both are fine as long as you read what you install.

### A6. −19%

**On slide:** −19%
experienced developers with AI, while they believed +20%
METR randomized trial, 2025

**Visual:** The number, very large, in red.

**Notes:**
METR's 2025 trial found that experienced developers were 19% slower with AI, while they believed they had been 20% faster. The 2026 follow-up leaned towards a speedup, but METR itself called the result unreliable, partly because developers refused to work without AI for the control group. The evidence is messy, which is one more reason to measure your own loop the way we just did.

### A7. Waterfall?

**On slide:** Isn't this just waterfall with markdown?

**Visual:** Light layout with the red chevron on the right.

**Notes:**
That's the Hacker News critique of heavy spec-driven development. The answer is to keep the specs tiny and the loops minutes long, and to update the spec whenever the build teaches you something. If your spec runs longer than three pages, it's too big.

### A8. Harnesses age

**On slide:** Every harness encodes something the model can't do yet

**Visual:** Dark layout with the blue-green blob on the left.

**Notes:**
Each part of a harness exists because of something the model couldn't do on its own, so as models improve, parts of it turn into dead weight; Anthropic has removed parts of its own harness for exactly that reason. Rerun this comparison every few months. That's what the talks folder in the repo is for.
