# Proposal

## Why

The map from slice 1 shows Norway but no plants yet. The site's purpose is to show Statkraft's hydropower plants, and every later slice (impact scores, detail panel, filters) needs real plant records to hang on. NVE publishes authoritative data on every Norwegian hydropower plant: attributes and owners from its API, locations from its map service. That lets us use real plants instead of sample data.

## What Changes

- New data script (`npm run data:plants`). It fetches NVE's hydropower plant list and the matching plant locations, keeps Statkraft's power plants, and writes a normalized snapshot file committed to the repo.
- Plants included: every hydropower plant in operation where a Statkraft company holds any ownership share. Today that is 117 plants: 113 power plants and 4 pumped-storage plants. Pure pumps (15) are left out because they don't generate power. Each plant records Statkraft's ownership share.
- The site loads the snapshot and shows one marker per plant on the existing map. Hovering over or focusing a marker shows the plant's name and capacity.
- The page shows where the data comes from, and the snapshot date ("Source: NVE, data as of YYYY-MM-DD").
- Playwright tests check markers against the snapshot, and unit-style checks validate the snapshot itself.

## Capabilities

### New Capabilities
- `plant-data`: The Statkraft plant dataset: which plants are included, which fields each plant carries, where the data comes from, and how it's refreshed.

### Modified Capabilities
- `plant-map`: Adds plant markers, marker tooltips and a data source note to the map page. Existing requirements are unchanged.

## Impact

- New: `scripts/fetch-plants.mjs`, `src/data/plants.json` (snapshot, about 40 KB), `src/data/plants.ts` (types and loader), marker code in `src/map.ts` or a new `src/markers.ts`, plus new tests.
- Network: only when the data script runs (`api.nve.no`, `kart.nve.no`). The site and tests stay offline apart from map tiles.
- No new runtime dependencies.
