# Glossary

- **Round**: lobby → countdown (5 s) → playing → over (5 s) → lobby. Countdown starts when anyone is present.
- **Player**: a human with a generated name, 100 HP. Joining mid-round means spectating until the next round.
- **Bot**: added only when exactly one player starts a round. Same rules as players; steps every 0.5 s; never scores.
- **Attack**: 25 damage to everyone in the 8 surrounding cells. Attacking or moving starts a 1 s wait; attacks during the wait are dropped.
- **Move**: one cell orthogonally, max 5 per second, no sharing cells, no leaving the grid.
- **Safe zone**: starts as the full grid; shrinks one cell per side every ZONE_INTERVAL_MS down to 13..16. Outside: 10 HP per second.
- **Score**: kill +100 (to the final hitter), +10 per zone shrink while alive, win +250. Zone/leave deaths credit no one.
- **Winner**: last unit alive (a bot can win); `none` if the last ones die on the same tick.
- **Highscores**: top 10 single-round scores, live during a round; ties go to the earlier score.
- **Grace period**: a disconnected player stays (hittable) for RECONNECT_MS and can reclaim by token; afterwards they are eliminated.
