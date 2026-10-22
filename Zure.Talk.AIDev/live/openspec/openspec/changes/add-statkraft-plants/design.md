# Design

## Context

Slice 1 built a Vite + TypeScript + Leaflet page (`src/map.ts`, where `createMap` fits Norway) and Playwright tests on port 4317 with stubbed tiles (`tests/e2e/fixtures.ts`). `window.__map` exposes the map to tests. See proposal.md for motivation.

What the NVE sources look like (checked 2026-10-21):
- `https://api.nve.no/web/Powerplant/GetHydroPowerPlantsInOperation` returns all 1,864 plants (about 2 MB JSON) with `VannKraftverkID`, `Navn`, `VannKVType` (Kraftverk / Pumpekraftverk / Pumpe), `MaksYtelse` (MW), `MidProd_91_20` (GWh), `Fylke`, `Kommune`, `Nedborsfeltnavn`, `IDriftDato`, and `Eiere[]` (`Navn`, `ProsentAndel`). There are no coordinates.
- `https://kart.nve.no/enterprise/rest/services/Vannkraft1/MapServer/0/query` (ArcGIS REST, `maxRecordCount` 2000) returns points per `vannkraftverknr`. With `outSR=4326` you get lat/lon. Some plants have more than one point (134 points for 132 Statkraft plant numbers).
- Statkraft owners appear as `STATKRAFT ENERGI AS` and `STATKRAFT SVERIGE AB`. There are 132 plants with a Statkraft share, 15 of them pure pumps, leaving 117 in the dataset. All of them have a location.

## Goals / Non-Goals

**Goals:**
- A reproducible, reviewable snapshot that the site and tests read offline.
- A plant model that later slices (impact, detail panel, filters) can extend without reshaping it.

**Non-Goals:**
- Impact scores, marker coloring by impact, the detail panel, filters (slices 3 to 5).
- Scheduled or automatic data refresh. Refresh is a manual developer command.
- Marker clustering. 117 markers render fine at country scale.

## Decisions

- **Snapshot file:** `src/data/plants.json`, shaped as `{ source, fetchedAt, plants: Plant[] }`, sorted by plant number, pretty-printed for readable diffs. Vite imports it as a module, so it is bundled with no fetch at runtime. Alternative: fetch `/plants.json` at runtime. That adds a loading state for no benefit at 40 KB.
- **Plant model** (`src/data/plants.ts`): `{ id, name, lat, lon, maxOutputMw, meanProductionGwh, type: "power-plant" | "pumped-storage", county, municipality, catchment, inOperationYear, statkraftSharePct }`, with English field names. The NVE-to-model mapping lives only in the script.
- **Script:** `scripts/fetch-plants.mjs` is plain Node 24 (global `fetch`, no dependencies). The steps:
  1. Fetch the API.
  2. Filter: owner name matches `/^STATKRAFT /i`, `VannKVType` is not `Pumpe`, `ErIDrift` is true.
  3. Query the map service with `where=vannkraftverknr IN (...)`, `outSR=4326`.
  4. When a plant has several points, take the first in `objectid` order, so the result is stable.
  5. Validate (see below). Write to a temp file and rename it over the snapshot, so a failure never leaves a half-written file.
  6. Exit with code 1 on any fetch or validation error.
- **Validation is shared:** `src/data/validate.ts` (pure TypeScript) checks the bounds, required fields, unique ids and share range. The script runs it before writing (Node 24 loads `.ts` by stripping types, so it imports that file directly), and a Playwright test runs the same function against the committed snapshot. One rule set, two uses.
- **Markers:** a `src/markers.ts` function `addPlantMarkers(map, plants)` creates `L.circleMarker`s, styled neutral for now (slice 3 colors them), each with a permanent `data-plant-id` attribute and `aria-label` on its SVG path. Tooltips are bound with `bindTooltip("Name – N MW")`. Circle markers render as SVG paths, so keyboard focus comes from setting `tabindex="0"` on the path and opening the tooltip on `focus`. Alternative: `L.marker` with icons. Those are DOM elements and naturally focusable, but colored circles suit impact coloring better.
- **Test access:** `window.__plants` exposes the loaded plants. Tests compare marker positions by asking Leaflet for each marker's `getLatLng()` via a `window.__markers` map keyed by plant id, rather than parsing pixels.
- **Source note:** a small footer-style overlay in the map's corner (`.data-source`), linking to `https://www.nve.no/`. The date comes from `fetchedAt`.

## Risks / Trade-offs

- [NVE changes field names or endpoints] → The script validates and fails loudly. The committed snapshot keeps the site working until the script is fixed.
- [Ownership rule shows plants where Statkraft is a minority owner] → Every record stores `statkraftSharePct`, so later slices can show or filter it. The rule is in the spec and is easy to tighten.
- [Duplicate map points pick an arbitrary location] → Only 2 plants are affected. The choice is deterministic (lowest `objectid`).
- [Node type stripping requires TS syntax that can be erased] → `validate.ts` uses only plain types: no enums, no namespaces.
