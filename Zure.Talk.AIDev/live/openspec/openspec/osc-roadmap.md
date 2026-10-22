# Roadmap: At-a-glance website with a map of Norway showing Statkraft's hydropower plants and their environmental impact on surrounding lakes, rivers and forests (EU EIA context), tested with Playwright

Mode: guided
Updated: 2026-10-21

## Slices
| # | Slice | Change | Status |
|---|---|---|---|
| 1 | Walking skeleton: Vite + TypeScript + Leaflet page showing a map of Norway, Playwright e2e test running | add-map-skeleton | archived |
| 2 | Real Statkraft plants on the map: data script joins NVE API + NVE GIS coordinates into a committed JSON snapshot; one marker per plant | add-statkraft-plants | implementing 7/7 |
| 3 | Environmental impact: illustrative low/medium/high scores for lakes, rivers, forests per plant; markers colored by impact; legend; "illustrative data" banner | — | planned |
| 4 | Plant detail panel: click a plant to see capacity, river system, impact breakdown and EIA status | — | planned |
| 5 | At-a-glance summary and filters: headline numbers (plants, MW, high-impact, EIA needed) and filters by impact level, impact type and county | — | planned |

## Decisions
- 2026-10-21 Company is Statkraft (state-owned, Norway's largest power producer, most hydropower plants; 132 plants with Statkraft in ownership in NVE data).
- 2026-10-21 Regulation context: EU EIA Directive 2011/92/EU as amended by 2014/52/EU (applies in Norway via the EEA). The user can name a newer rule if that is meant.
- 2026-10-21 Plant data is real: NVE API `api.nve.no/web/Powerplant/GetHydroPowerPlantsInOperation` (attributes, owners) joined with NVE GIS `kart.nve.no/enterprise/rest/services/Vannkraft1/MapServer/0` (coordinates) on plant number. Snapshot committed so the site works offline and tests are deterministic.
- 2026-10-21 Impact scores are illustrative (no public per-plant dataset exists), generated deterministically, and clearly labeled on the page.
- 2026-10-21 Stack: Vite + TypeScript + Leaflet (OpenStreetMap tiles), Playwright e2e tests for every slice. Tests must not depend on live tile servers.
- 2026-10-21 v1 scope (default, user did not choose): detail panel, filters, summary numbers and EIA status are all included, as slices 4 and 5.
- 2026-10-21 Playwright serves the built site on port 4317, not 4173: another local project (Claude-of-Duty) keeps a preview server on 4173, and the tests silently reused it.
- 2026-10-21 Plant set: any Statkraft ownership share (Statkraft Energi AS or Statkraft Sverige AB), generating plants only (pure pumps excluded), giving 111 plants (6 plants list Statkraft as an owner with no share; another company holds 100%, so they are left out). Each record stores Statkraft's share.

## Next
Correct the plant count (117 -> 111) in the change's proposal, design and tasks with openspec-update-change, then verify and archive.
