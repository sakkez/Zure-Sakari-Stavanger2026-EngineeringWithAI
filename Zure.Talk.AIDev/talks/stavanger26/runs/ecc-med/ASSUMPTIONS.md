# Assumptions and decisions

Rules came from the product owner (HP 100, 25 damage to all 8 neighbours, 1 s cooldown after
attack or move, 5 moves/s, zone shrink 1/side to 13..16, 10 dmg/s outside, 100/10/250 points,
top-10 highscores, one bot for a lone player, RECONNECT_MS 10 s, etc.). The product owner said
the stack and test plan are my call. Things I decided myself:

- Stack: Node `http` + `ws`, vanilla TS client bundled by esbuild at `npm start`. Server ticks every 50 ms.
- Reconnect identity is a random token kept in `sessionStorage`, so it lasts per tab, including across reloads.
- A disconnected player's block stays on the grid with `data-connected="false"` (greyed out), and a
  "<name> disconnected" line goes into the feed (`data-testid="events"`). After RECONNECT_MS it is removed.
- Player blocks are shown during `playing` and `over` (the survivor stays visible on the result screen).
- Damage numbers: you only see the ones that involve you (`dealt` in yellow, `taken` in red). Zone damage on you counts as `taken`.
- Zone damage ticks run every 1 s from round start. If the server falls behind, missed ticks are skipped, not replayed.
- Game state is mutated in place inside the `Game` class (one authoritative owner), not copied immutably. That keeps the tick loop simple.
- A player who joins during countdown plays in that round.
- Default PORT is 3000 when `$PORT` is unset. The e2e suite starts its own server on 3199 with short timers.
- If everyone in the lobby disconnects, the countdown stops at once. Their blocks stay in the reconnect window,
  and a reconnect restarts the countdown. This was a bug found in TDD cycle 1, see `docs/tdd/grid-royale.tdd.md`.
- I corrected one of my own unit tests before committing: it expected the first zone damage one tick
  too late, but the shrink at 16 s is also a damage tick.
