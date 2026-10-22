# Acceptance suite (the referee)

A hidden Playwright suite that plays each run's game through the browser, after the
timebox. It tests the product owner's `template/talk/brief.md` through the contract in
`template/base/AGENTS.md` ("What the referee needs"), which every run sees.

- `RUN_DIR` is the run under test. Each test starts that run's own `npm start` on a free
  port, with the speed-up variables it needs (`fixtures.ts`), and stops it afterwards, so
  no two tests share a game. `scripts/scoreboard.sh` sets `RUN_DIR` per run.
- No run sees this suite while building. `new-talk.sh` freezes a copy per talk, so each
  talk keeps the exact suite it was scored with. Run `npm install` in that copy.
- The scoreboard reads the JSON reporter's `stats` (expected / unexpected / flaky / skipped).

## What it covers

| Spec | From the brief |
| --- | --- |
| `players` | generated, distinct names; spawning 3 apart; seeing each other move; reconnecting within the window; leaving after it; the countdown stopping when everyone leaves |
| `rounds` | countdown, then a lone player against one bot; spectating mid-round, playing the next one; highscores start empty |
| `fighting` | grid edges and occupied cells; dropped extra moves; 25 damage and the 1 second cooldown; moving starting the same wait, and the cooldown bar filling; a kill ending the round, 350 points, highscores kept into a fresh next round |
| `bot` | it plays by the player rules: 100 hit points, 25 a hit, a second's wait after its last step and between hits, standing still; killing it is worth 100; it never enters the highscores |
| `zone` | shrinking to the middle 4 by 4 and stopping; 10 a second outside, nothing inside; 10 points a shrink to the living; a zone death gives no kill |
| `screen` | a health bar on every block, your hit points out of 100 always in view; damage numbers rising from whoever was hit, yellow or green for hits you land and red for hits you take, fading out; the rules list behind its button; live highscores during a round, in view with the grid on a laptop |
| `phone` | the on-screen buttons fit on a phone screen and move you |

Not covered, because a browser cannot make them happen on cue: a draw (the last players
dying on the same tick), spawning when the grid is too full to keep 3 apart, ties in the
highscores, and the 10-entry limit. The AI judge reads the code for those.

## Changing it

The suite is only fair if a correct game passes it every time. `template/reference/` is a
small build of the brief for exactly that. After changing the brief, the contract or a spec:

```bash
cd template/shared/acceptance && npm install
RUN_DIR=../../reference npx playwright test --repeat-each=3
```

All 21 tests passed twice over (42/42, about 4 minutes) at the last change, with the reference game animating its blocks, health bars and zone.
A full run against one game takes about 1.5 to 2 minutes.
