# Product owner's brief

What the product owner has decided about the game in idea.md. Only the product-owner
agent sees this, and the acceptance suite tests it. Change both together.

## Players

- Names are generated as "Adjective Animal", for example "Brave Otter", and are unique among
  everyone in the game, bots included.
- A player who reloads or loses the connection gets the same name, place, hit points and
  score back if they return within 10 seconds (keep a token in the browser). Until then they
  stay on the grid where they were, and can still be hit.
- After 10 seconds they are gone. A player gone mid-round counts as eliminated, and nobody
  gets a kill for it.

## Rounds

- As soon as one player is in the lobby, a 5 second countdown starts. Everyone who arrives
  before it ends plays in the round. If everyone leaves during the countdown, it stops.
- If only one player is there when the round starts, one bot joins the round. With two or
  more players there is no bot.
- Each player spawns on a random free cell at least 3 cells from everyone else, counting a
  diagonal step as one, when there is room.
- Players who arrive while a round is running spectate it and play in the next one.
- The last one alive, player or bot, wins. If the last ones die on the same tick, there is
  no winner, and the result says so.
- The result shows for 5 seconds. Then everyone connected, spectators included, goes back to
  the lobby, and the next countdown starts.

## Moving and fighting

- A move is one cell up, down, left or right. No diagonals. You cannot leave the grid or move
  into an occupied cell.
- A player can make at most 5 moves per second. Extra moves are dropped, not queued.
- Players start with 100 hit points. An attack hits everyone in the 8 cells around the
  attacker for 25 points.
- After attacking, a player waits 1 second before the next attack. Moving starts the same
  wait: you cannot attack until 1 second after your last move either, which favours whoever
  stands still and lets the others come to them. Attacks during the wait are dropped, not
  queued, so the sooner you press after it ends, the sooner you hit.
- Moving is never blocked by the wait.
- At 0 hit points you are out: off the grid, spectating for the rest of the round.
- Dead players and spectators see the whole game but cannot move or attack.

## The bot

- A bot plays by the same rules as a player: 100 hit points, an attack that hits everyone in
  the 8 cells around it for 25, the 1 second wait after attacking and after moving, and the
  zone hurts it the same.
- It has a generated name like everyone else and is shown as a bot.
- Every half second it takes one step towards the nearest player, along the axis with the
  bigger gap first, and along the other one if that cell is taken. If it is outside the safe
  zone, it steps towards the zone's centre instead.
- While a player is in one of the 8 cells around it, it stands still and attacks as soon as
  the wait allows.
- Bots never score and never appear in the highscores.

## The zone

- The safe zone starts as the whole grid. Every 15 seconds it shrinks by one cell on every
  side, until it is a 4 by 4 square in the middle (x and y from 13 to 16).
- Once a second, on the same tick for everyone, each player and bot outside the zone loses 10
  hit points. You can walk out of the zone; it only hurts you.

## Score and highscores

- Every player's score starts at 0 each round:
  - 100 points for each kill, given to whoever lands the hit that takes a player or bot to 0.
    Deaths in the zone or from leaving give nobody points.
  - 10 points each time the zone shrinks while you are alive.
  - 250 points for winning the round.
- Your score shows during the round, and you keep it after you die.
- When a round ends, every player who started it enters their score into the highscores: the
  10 best round scores since the server started, best first, earlier first on a tie. The same
  name can appear more than once.
- The highscores are live. During a round, everyone playing it is on the list with their
  current score, as if the round ended now, and the list updates as scores change. When the
  round ends those become fixed entries. A running round's entries count as made now, so on
  a tie they come after the fixed ones.
- The highscores show in every phase. On a laptop screen they stay in view the whole time,
  together with the grid; on a phone they can be one tap away. They live in server memory and reset with it.

## What the player sees

- Every player and bot on the grid has a health bar on its block, showing its hit points out
  of its maximum.
- You always see your own hit points as current and max, like 75 / 100.
- A cooldown bar fills up during the 1 second wait after you attack or move, and shows when
  you can attack again.
- When you hit someone, the damage floats up from them in yellow or green and fades out
  within about a second. When someone hits you, the damage floats up from you in red. Only
  hits show numbers, and only yours: the ones you deal and the ones you take.
- A rules button shows this list, and hides it again:
  - Move one cell up, down, left or right, at most 5 moves a second.
  - Attack hits everyone in the 8 cells around you for 25.
  - After you attack or move, wait 1 second before attacking again. Presses during the wait
    are dropped.
  - You start with 100 hit points. At 0 you are out.
  - Outside the safe zone you lose 10 hit points a second.
  - Points: 100 a kill, 10 for each zone shrink you live through, 250 for winning.

Where things go on the screen, and how it looks, is the builders' call.

## Out of scope

- Accounts, chat, items, pickups, teams, sound, and scores kept across restarts.
