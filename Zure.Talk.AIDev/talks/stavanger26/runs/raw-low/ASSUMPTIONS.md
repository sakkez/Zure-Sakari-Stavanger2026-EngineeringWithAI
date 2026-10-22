# Assumptions (decided without the product owner)
- Movement is rate-limited to one step per 100 ms; every move also restarts the 1 s attack cooldown (PO rule).
- Zone stops shrinking at 2x2. Outside-zone damage gives no kill credit.
- Bot is named BotN, moves one step per 400 ms toward the nearest foe, attacks when adjacent.
- Only humans enter the highscore list (top 10 round scores, recorded when the round ends).
- Damage numbers are shown only for hits you deal or take.
- Reconnect uses a per-tab id in sessionStorage; a new tab/context is a new player.
- Players who joined mid-round wait in the lobby state (no player element) until the next round.
