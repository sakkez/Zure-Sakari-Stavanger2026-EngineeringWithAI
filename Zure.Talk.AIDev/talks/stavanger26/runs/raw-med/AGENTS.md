# Build rules

No human is available during this run. The `product-owner` subagent speaks for the user:
ask it about requirements and rules, or show it a plan to approve. Do not read its
definition file; ask it. Where you decide something yourself, write it to `ASSUMPTIONS.md`
and keep going.

## Stack (fixed, so runs can be compared)

- TypeScript on Node 22, npm. Vitest for unit tests, Playwright for end-to-end tests.
- One package with a server and a browser client. Your choice of libraries.
- `npm start` runs the game as a single Node process on `$PORT` (read it from the environment).
  This is also how it is deployed, so it must work without a dev server.
- `npm test` runs your unit tests. `./checks.sh` runs after every edit.
- `npm run test:e2e` runs your Playwright tests against the running game.
  Playwright's Chromium is already installed; do not download browsers.

## The game is ephemeral

- Keep all game state in server memory. No database, no files, no external services.
- A restart resets every game; that is fine.

## Rules

- The server is authoritative. Clients send intents; the server owns game state.
- Prove it works with Playwright: open two browser contexts as two players and test
  joining, moving, seeing each other's moves, and a disconnect.
- Never delete, skip or weaken a test to get green. If a test looks wrong, say so in ASSUMPTIONS.md.
- Commit to this folder's git repo at each working step, with a short message.
- Stay inside this folder.

## What the referee needs

A hidden Playwright suite plays the game after the timebox. It only works through this
contract, so keep to it exactly.

- Keyboard: arrow keys or WASD move, Space attacks. On screen: buttons with
  `data-testid` `up`, `down`, `left`, `right` and `attack`, usable on a phone.
- `data-testid="me"`: your name. `data-testid="score"`: your score this round, a number.
- `data-testid="hp"` and `data-testid="hp-max"`: your hit points and their maximum, each a
  number, always in view.
- `data-testid="cooldown"`: your attack cooldown bar, with `data-ready="true"` when you can
  attack and `"false"` during the wait, and `data-progress` from 0 (the wait just started)
  to 1 (ready).
- `data-testid="phase"`: one of `lobby`, `countdown`, `playing`, `over`.
- `data-testid="winner"`, shown while the phase is `over`: the winner's name, or `none`.
- `data-testid="grid"`: the grid, 30 by 30, x and y from 0 to 29, (0, 0) top left.
- While a round is playing, one `data-testid="player"` element per living player or bot
  in it, with `data-name`, `data-x`, `data-y`, `data-hp`, and `data-bot="true"` on bots.
  The element is the block on its cell. Inside it, a `data-testid="healthbar"` element
  holds a `data-testid="healthbar-fill"` element whose width is the hit points' share of the bar.
- `data-testid="damage"`: one element per floating damage number, inside the grid, with
  `data-target` (the name of whoever was hit), `data-amount`, and `data-kind`: `dealt`
  for hits you land, `taken` for hits on you. Its text colour is the colour you see.
- `data-testid="zone"` with `data-x0`, `data-y0`, `data-x1`, `data-y1`: the safe zone's corners, inclusive.
- `data-testid="highscores"`: the highscore list, holding one `data-testid="highscore"`
  element per entry, best first, with `data-name` and `data-score`.
- `data-testid="rules-button"` shows and hides `data-testid="rules"`, the rules as a list
  of `li` items.
- Animate as much as you like, but only on the surface: `data-*` attributes and the text of
  `hp`, `hp-max`, `score`, `phase` and `winner` change at once, never after an animation.
- The referee speeds the game up through environment variables. Read them, and use
  your own defaults when they are unset: `COUNTDOWN_MS`, `ZONE_INTERVAL_MS`, `RESULT_MS`
  and `RECONNECT_MS`.
