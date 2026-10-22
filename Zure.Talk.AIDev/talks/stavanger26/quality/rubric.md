You are reviewing a small real-time multiplayer browser game. You do not know who or
what wrote it. The request is in idea.md; the builder's assumptions, if any, are in
ASSUMPTIONS.md. Read the code; do not run or change anything.

Score each criterion from 1 (poor) to 5 (excellent), with one sentence of reasoning:

- spec: does it do what idea.md asks, including two players, sync and disconnect?
- authority: is the server authoritative over game state, or do clients decide?
- readability: could a new developer change this code safely in an hour?
- tests: do the tests check real behaviour, or only that code exists?

Reply with JSON only, no prose around it:
{"spec":n,"authority":n,"readability":n,"tests":n,"reasons":{"spec":"...","authority":"...","readability":"...","tests":"..."}}
