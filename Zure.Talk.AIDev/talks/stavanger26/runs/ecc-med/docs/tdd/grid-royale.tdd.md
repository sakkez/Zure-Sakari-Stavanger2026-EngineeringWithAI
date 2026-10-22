# Grid Royale: TDD evidence

## Source plan

There was no `*.plan.md`. The plan was the one stated in the session: a Node `http` + `ws` authoritative server, a vanilla TS
client, Vitest for logic, and Playwright with two browser contexts. The rules came from the product-owner subagent.

**Honest note:** the first version of the game (commit `beaff48`) was written before its tests, so it was not TDD.
The TDD cycles below came after it. They found and fixed one real bug and made the server testable.

## User journeys

1. As a player, I open the page and drop into the arena with a generated name, so I can play at once.
2. As a player, I see other players move in real time, so I can chase or flee.
3. As a player, I hit adjacent players and see damage dealt and taken, so hits feel real.
4. As a player, I see when another player disconnects, and I can reconnect to my own player within the window.
5. As a lone player, I get a bot to fight. As a late joiner or a dead player, I spectate until the next round.
6. As a player, I earn points for kills, for surviving zone shrinks and for winning, and I see them on a live highscore list.

## Task report

| Cycle | What | Command | RED evidence | GREEN evidence |
|---|---|---|---|---|
| 1 | Reconnecting during an empty lobby restarts the countdown | `npx vitest run` | `expected 'lobby' to be 'countdown'` (commit `fadf4ad`) | 13/13 after `join()` fix (commit `54a3a7a`) |
| 2 | Characterization of the PO rules | `npx vitest run` | **None.** All 7 passed on the first run, so the code already met them (commit `141e2e0`) | 20/20 |
| 3 | Server integration over real HTTP and WebSocket | `npx vitest run` | `Cannot find module '../src/app.js'` (compile-time RED, commit `871ef4f`) | 25/25 unit + integration; `npm run test:e2e` 2/2 after the refactor (commit `5ee1965`) |
| 4 | Env config and name uniqueness | `npm run test:coverage` | None (characterization) | 30/30 (commit `ba1ce7c`) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Countdown starts on first join, round starts after COUNTDOWN_MS | `tests/game.test.ts` first join… | unit | PASS |
| 2 | A lone player gets exactly one bot; two players get none | lone player / two players… | unit | PASS |
| 3 | Spawns ≥3 apart; names unique "Adjective Animal" | two players…, generateName | unit | PASS |
| 4 | One cell per move, walls and occupied cells block, max 5 moves/s | moves one cell… | unit | PASS |
| 5 | Attack hits 8 neighbours for 25; 1 s wait after attack or move | attack hits… | unit | PASS |
| 6 | Kill +100, win +250, highscore entry, back to countdown | kill gives 100… | unit | PASS |
| 7 | Zone shrinks 1/side, +10 survival, 10 dmg/s outside, floor 13..16 | zone shrinks…, zone stops… | unit | PASS |
| 8 | Simultaneous last deaths give winner `none` | simultaneous zone deaths… | unit | PASS |
| 9 | Zone deaths give no kill points | zone deaths give nobody… | unit | PASS |
| 10 | Disconnected block stays until RECONNECT_MS, rejoin by token, then eliminated | disconnected player… | unit | PASS |
| 11 | Countdown stops when everyone leaves and restarts on reconnect | countdown stops… (cycle 1) | unit | PASS |
| 12 | Mid-round joiners spectate, then play the next round | mid-round joiner…, spectator… | unit | PASS |
| 13 | Dead players leave the grid, keep their score, cannot act | dead player… | unit | PASS |
| 14 | Highscores: top 10, earlier first on a tie, live after fixed, no bots | highscores…, bots never… | unit | PASS |
| 15 | Bot chases and attacks; outside the zone it heads for the centre at 1 step/500 ms | bot… | unit | PASS |
| 16 | Env vars override timings; invalid values fall back | `tests/config-names.test.ts` | unit | PASS |
| 17 | Page served, unknown path 404 | `tests/server.test.ts` | integration | PASS |
| 18 | ws: welcome with id and token, state stream, moves seen by the other player, disconnect seen, round over | server.test.ts | integration | PASS |
| 19 | Malformed or unknown messages are ignored and the socket stays open | server.test.ts | integration | PASS |
| 20 | Two browsers: join, see each other's keyboard and button moves, disconnect greyed then removed, winner and highscore | `e2e/two-players.spec.ts` | e2e | PASS |
| 21 | Two browsers: attack shows `dealt`/`taken` damage, HP 75, cooldown not ready, rules list | `e2e/two-players.spec.ts` | e2e | PASS |

## Coverage and known gaps

`npm run test:coverage`: statements 96.22%, branches 91.35%, functions 97.05%, lines 97.65% (80% thresholds enforced).

- `src/client.ts` (browser) is excluded from unit coverage. Only the Playwright suite exercises it.
- `src/server.ts` is a 10-line process entry point, excluded from coverage. `npm start` in the e2e suite exercises it.
- Not covered by an automated test: the phone layout, and the referee's cooldown `data-progress` values between 0 and 1.
