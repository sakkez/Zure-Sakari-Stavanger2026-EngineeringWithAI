# Grid Royale — browser battle royale

Status: ready-for-agent

## Problem Statement

People with a phone or laptop want a quick, shared fight in the browser: open a page, drop into the same arena as everyone else, and play a short round of last-one-standing without accounts, installs or waiting for friends. They need to see each other move in real time, see health and damage clearly, know when they can strike again, see the zone closing in, and know when someone has dropped out. If they're alone, they still want someone to fight.

## Solution

A single-page browser game served by one Node process. Everyone who opens the page becomes a **Player** with a generated name in one shared **Round** on a 30×30 grid. The server is authoritative: clients only send intents (move, attack) and render the server's state. Rounds cycle lobby → countdown → playing → over. A **Safe zone** shrinks over time and hurts anyone outside it. The last unit alive wins. A **Bot** joins when a player starts a round alone. Scores feed a live **Highscores** list. Disconnected players get a **Grace period** to come back. All state lives in server memory.

## User Stories

1. As a visitor, I want to join just by opening the page, so that I can play without signing up.
2. As a player, I want a generated name shown to me, so that I know who I am on the grid.
3. As a player, I want my name to differ from everyone else's, so that I can tell players apart.
4. As a player, I want the countdown to start as soon as anyone is present, so that I don't wait for a quorum.
5. As a player, I want a 5-second countdown before a round, so that others can join that round.
6. As a player, I want to see the current phase (lobby, countdown, playing, over), so that I know what's happening.
7. As a player, I want to spawn on a random free cell, so that rounds feel different.
8. As a player, I want to move one cell per arrow/WASD press, so that movement is precise.
9. As a phone player, I want on-screen up/down/left/right and attack buttons, so that I can play without a keyboard.
10. As a player, I want moves capped at 5 per second with extras dropped, so that nobody gains by spamming.
11. As a player, I want to be blocked from sharing a cell or leaving the grid, so that positions are unambiguous.
12. As a player, I want my movement to animate smoothly, so that the game feels alive.
13. As a player, I want Space or the attack button to hit everyone in the 8 cells around me for 25 damage, so that positioning matters.
14. As a player, I want a 1-second wait after attacking or moving before I can attack again, so that fights have rhythm.
15. As a player, I want attacks pressed during the wait to be dropped, not queued, so that inputs are predictable.
16. As a player, I want a cooldown bar that fills from 0 to 1 and shows when I'm ready, so that I know when I can strike.
17. As a player, I want to see my hit points and maximum (100) at all times, so that I know how close I am to dying.
18. As a player, I want a health bar over every unit, so that I can pick targets.
19. As a player, I want floating damage numbers for hits I deal and take, in distinct colours, so that hits feel tangible.
20. As a player, I want a hit to visibly jolt the target, so that combat feels physical.
21. As a player, I want the safe zone drawn on the grid and to see it close in, so that I know where to go.
22. As a player, I want the zone to shrink one cell per side every interval down to a 4×4 centre (13..16), so that rounds end.
23. As a player, I want to lose 10 HP per second outside the zone, on the same tick as everyone, so that the zone is fair and threatening.
24. As a solo player, I want one bot to join when I start a round alone, so that I have someone to fight.
25. As a solo player, I want the bot to chase me, attack when adjacent, and flee the zone edge toward the centre, so that it's a real opponent.
26. As a player, I want bots marked as bots, so that I know who's human.
27. As a player, I want 100 points for a killing blow, so that aggression pays.
28. As a player, I want 10 points every time the zone shrinks while I'm alive, so that surviving pays.
29. As a player, I want 250 points for winning, so that winning matters most.
30. As a player, I want zone deaths and leavers to credit nobody, so that kills are earned.
31. As a player, I want my round score shown, starting at 0 each round, so that I can track progress.
32. As a player, I want a live highscore list of the 10 best single-round scores, with current-round scores shown live, so that I can compete.
33. As a player, I want earlier scores to rank first on ties, so that the order is stable.
34. As a player, I want bots kept off the highscore list, so that it only ranks humans.
35. As a player, I want the winner's name shown when the round is over, or `none` if the last ones died together, so that the outcome is clear.
36. As a player, I want a bot to be able to win, so that losing to it is real.
37. As a player, I want the result shown for 5 seconds before the next lobby, so that I can see what happened.
38. As a dead player, I want to keep watching the round, so that I stay engaged.
39. As a mid-round joiner, I want to watch and join the next round, so that rounds stay fair.
40. As a player, I want to see when another player disconnects, so that I understand why they stopped moving.
41. As a player whose connection drops, I want 10 seconds to come back with the same name, place, HP and score, so that a blip doesn't ruin my round.
42. As a player, I want a disconnected player to remain hittable during the grace period, so that disconnecting isn't an escape.
43. As a player, I want a player who doesn't come back in time to be eliminated with no kill credited, so that the round can end.
44. As a player who disconnects in the lobby or countdown, I want to still count as present during the grace period, so that I'm in the next round if I come back.
45. As a player, I want the countdown to stop if everyone leaves, so that empty rounds don't start.
46. As a player, I want a rules button that shows and hides the rules list, so that I can learn the game.
47. As a player, I want sharp, vivid colours, so that the game looks exciting.
48. As the referee, I want every data attribute and the hp/score/phase/winner text to update immediately, never after an animation, so that automated checks are reliable.
49. As the referee, I want to speed the game up via COUNTDOWN_MS, ZONE_INTERVAL_MS, RESULT_MS and RECONNECT_MS, so that tests run fast.
50. As an operator, I want `npm start` to run everything on $PORT as one process with no database, so that deployment is trivial.

## Implementation Decisions

- **Game rules module** (server): a pure, deep module owning all game state, with an injected clock (`now` passed into every call) and injected random source. Interface: `connect(token?, now) → player`, `disconnect(id, now)`, `move(id, dir, now)`, `attack(id, now)`, `tick(now)`, `snapshot(now)`, `meView(id, now)`, `highscores()`. No I/O.
- **Server transport**: one HTTP server serving static client files plus a WebSocket endpoint. It ticks the rules module every 50 ms and broadcasts a full snapshot plus a per-connection "me" view to every client after each tick and each intent.
- **Protocol**: client → server: `hello{token?}`, `move{dir}`, `attack`. Server → client: `welcome{id, token, name}`, `state{snapshot, me}`. Snapshot holds phase, phase end time, server now, winner, zone, units (name, position, hp, bot, alive, connected), recent damage events (target, attacker, amount, position), highscores.
- **Reconnect**: the server issues a token on welcome; the client keeps it in per-tab session storage and sends it on reconnect. Reload reclaims; two tabs are two players.
- **Config**: defaults COUNTDOWN 5000, ZONE_INTERVAL 15000, RESULT 5000, RECONNECT 10000 ms, overridden by env vars. Zone damage tick is a fixed 1000 ms.
- **Presence**: a player in their grace period counts as present for starting countdowns and is spawned into a starting round.
- **Bot AI**: every 500 ms; outside zone → step toward zone centre; adjacent (8 cells) to a human → attack when ready; else step toward nearest human along the bigger-gap axis, falling back to the other axis.
- **Round end**: checked after every attack and tick; alive ≤ 1 → over. Win bonus only for a human winner. All humans in the round have their score fixed into highscores (top 10, ties by insertion order).
- **Client**: renders the data-testid contract from AGENTS.md. Units are positioned by CSS transform transitions; data attributes are set immediately. Cooldown progress is computed each animation frame from server cooldown start/end adjusted by clock offset. Damage numbers are shown only when they involve the viewer (`dealt` = viewer attacked, `taken` = viewer was hit). Disconnected units show dimmed with `data-connected="false"`, plus a toast.

## Testing Decisions

- Good tests check external behaviour only: the browser contract for end-to-end tests, and the rules module's public interface for unit tests. No reaching into rendering internals or transport details.
- **Seam 1 — browser contract (Playwright)**, approved by the product owner: two or more browser contexts against the running game, using only data-testid elements and keyboard/buttons, with env vars shortening timings. Covers: joining with distinct names, round start without a bot for two players, keyboard and button moves seen by the other player, cooldown, HP/HP max, health bars, live highscores, disconnect visible to the other player, grace-period elimination, winner and win score, solo round adding a bot, rules button toggling the rules.
- **Seam 2 — rules module (Vitest)** with injected clock and random source: phase cycle, bot spawn, movement blocking and rate limit, attack damage/cooldown/kills/scoring, zone shrink and zone damage, reconnect and grace-period elimination. To add: bot behaviour, simultaneous death → `none`, highscore ties and live entries, countdown cancel when everyone leaves.
- Prior art: the existing unit test file for the rules module and the existing two-player Playwright spec.

## Out of Scope

- Accounts, persistence, or highscores that survive a restart.
- Multiple arenas or rooms; walls or obstacles.
- Chat, cosmetics, sound.
- Anti-cheat beyond server authority and the move rate limit.

## Further Notes

- Domain terms are defined in GLOSSARY.md; decisions made without the product owner are in ASSUMPTIONS.md.
- The hidden referee suite only uses the AGENTS.md contract, so the contract must not drift.
