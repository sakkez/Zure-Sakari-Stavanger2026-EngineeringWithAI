# Assumptions

Rules come from the product owner (see GLOSSARY.md). Decisions I made myself:

- Defaults: COUNTDOWN_MS 5000, ZONE_INTERVAL_MS 15000, RESULT_MS 5000, RECONNECT_MS 10000 (all from the PO). Zone damage ticks every 1000 ms regardless of env.
- A blocked move (off grid, occupied cell, over the 5-per-second limit) does nothing: it does not start the attack wait.
- The rate limit is a sliding 1-second window of successful moves.
- Damage numbers are shown only for hits involving you: `dealt` (yellow) when you hit someone, `taken` (red) when you are hit, including zone damage. They float ~1.1 s.
- A disconnected player stays on the grid dimmed with "(offline)", `data-connected="false"` on their player element, and others get a toast. (PO: my call.)
- Reconnect token lives in sessionStorage, so a reload reclaims the player but two tabs are two players.
- `score` shows your score from the current or most recent round you played; it resets when a new round starts.
- Spawns are random free cells; no minimum distance. No walls.
- Bots target the nearest human; with one bot there is no bot-vs-bot.
