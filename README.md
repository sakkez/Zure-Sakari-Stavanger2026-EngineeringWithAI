# Live: Engineering with AI — Stavanger 2026

Material for Sakari Nahi's (Zure) talk on AI-assisted development: the talk harness, the
record of the Stavanger 2026 delivery, live demos and a couple of side projects built with AI.
The slide deck is in `Zure - Sakari Nahi - Stavanger 2026 - Live Engineering with AI.pdf`.

## What's here

| Path | What |
| --- | --- |
| [`Zure.Talk.AIDev/`](Zure.Talk.AIDev/README.md) | The talk itself. The same game idea is built five times in parallel with different skill packs and effort levels, then scored by a hidden Playwright suite and a shared quality toolchain. |
| `Zure.Talk.AIDev/template/` | The reusable harness: run definitions, shared base, skill packs, acceptance suite and quality tools |
| `Zure.Talk.AIDev/talks/stavanger26/` | What ran in Stavanger: the brief, the five runs, results and the scoreboard |
| [`Zure.Talk.AIDev/live/openspec/`](Zure.Talk.AIDev/live/openspec/README.md) | Live demo of spec-driven development with OpenSpec: a map of Statkraft's hydropower plants in Norway (Vite, TypeScript, Leaflet, Playwright) |
| `Zure.Talk.AIDev/docs/`, `slides/`, `scripts/` | Talk reference and speaker notes, the deck builder, and scripts to start, score, reset and deploy runs |
| `Gauntlet/` | A dark-fantasy battle-royale action RPG built by a team of AI agents: a Three.js browser version, plus a [Godot 4 port](Gauntlet/godot/README.md). `docs/` holds the team brief and the critique rounds. |
| `Memegen/` | "How do I feel?": a small Node server that picks the matching meme from 100 templates using the TypeSafe AI SDK |

## Running things

- **Talk harness:** see [Zure.Talk.AIDev/README.md](Zure.Talk.AIDev/README.md)
- **OpenSpec demo:** `cd Zure.Talk.AIDev/live/openspec && npm install && npm run dev`
- **Gauntlet (browser):** `cd Gauntlet && npm install && npm run dev`
- **Memegen:** fill in `Memegen/.env` (`CLAUDE_CODE_OAUTH_TOKEN`, `TYPESAFE_API_KEY`), then `cd Memegen && npm install && npm start`
