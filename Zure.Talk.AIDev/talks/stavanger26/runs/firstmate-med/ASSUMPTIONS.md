# Assumptions

Rules come from the product owner (via the build brief). Decisions made by the builder:

- Movement: one cell per key press / button tap; no diagonal moves; cannot leave the grid or enter an occupied cell (move is ignored).
- Spawns: random cells at least 2 cells from the edge and, where possible, not within 2 cells of another player.
- Bot target is the nearest living human by Manhattan distance; on equal x/y gaps it steps along x first. When adjacent to anyone it stands still and attacks when its cooldown allows.
- An attack hits every living player/bot in the 8 surrounding cells. A kill is awarded to the attacker; zone deaths award no kill.
- Zone damage and zone shrink run on fixed server timers that start when the round starts (damage every 1000 ms, shrink every ZONE_INTERVAL_MS).
- Highscores include every human participant's round score (including 0) when a round ends; top 10 kept, ties keep the earlier entry first.
- Players (and bots) are rendered during `playing` and also during `over` (the survivors), so the winner stays visible.
- Disconnected players stay on the board with `data-connected="false"` and are drawn faded with a marker. A disconnected player who has not returned does not count for starting a countdown or joining a new round.
- If all humans leave during the countdown, the game returns to the lobby.
- The reconnect token is stored in localStorage; a second tab with the same token takes over the player and closes the old socket.
- State is broadcast to every client every 50 ms and after each intent.
- Floating damage numbers are only shown for hits you deal (`dealt`, yellow) or take (`taken`, red); hits between other players are not shown as numbers.
- Score/HP shown in the lobby are the last-reset values (0 / 100).
