# Assumptions

Rules came from the product owner (HP 100, 25 damage to all 8 neighbours, 1 s cooldown,
5 moves/s, zone shrinks 1 cell per side every ZONE_INTERVAL_MS down to 13..16, 10 HP/s
outside, 100 per kill / 10 per shrink survived / 250 per win, top-10 per-round highscores
without bots, bot for a lone player, reconnect by browser token within RECONNECT_MS).

Decisions I made myself:

- The reconnect token is kept in `sessionStorage`: a reload keeps your player, a new tab or
  browser context is a new player. If a token is already in use by a live socket, the new
  connection gets a fresh identity.
- The 5 moves/s limit is a sliding 1 s window (5 moves in any second).
- An attack with nobody adjacent still uses the cooldown.
- Zone damage ticks every 1000 ms from round start, independent of ZONE_INTERVAL_MS.
  Survival points are only paid when the zone actually shrinks (not after it hits 4x4).
- Zone deaths and disconnect timeouts give nobody a kill.
- Damage numbers are only shown for hits that involve you (`dealt` yellow #ffd23f,
  `taken` red #ff3b3b, including zone damage on you).
- Player elements are rendered during `playing` and `over` (the winner stays visible).
  Outside a round, `hp` shows 100/100 and `score` 0; spectators and dead players see their
  last state (dead: hp 0).
- Countdown starts once a connected player is present; it falls back to `lobby` if no one is
  connected. Every session present when the countdown ends plays.
- Every human's round score is recorded in the highscores, including 0.
- Disconnected players are shown with `data-connected="false"` on their player block, greyed
  out, in the "Arena" list, and a toast announces it.
