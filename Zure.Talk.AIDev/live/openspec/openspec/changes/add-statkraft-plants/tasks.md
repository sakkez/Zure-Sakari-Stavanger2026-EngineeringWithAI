# Tasks

## 1. Plant data

- [x] 1.1 Add `src/data/plants.ts` (the `Plant` and `PlantSnapshot` types) and `src/data/validate.ts` (`validateSnapshot`: required fields, unique ids, Norway bounds, share range). Use only type syntax that Node can strip. Verify `npm run build` type-checks.
- [x] 1.2 Write `scripts/fetch-plants.mjs` and the `data:plants` npm script. It fetches the NVE API and the map service, filters to Statkraft generating plants, joins on plant number (lowest `objectid` when there are duplicates), reports plants without a location, validates, and writes `src/data/plants.json` atomically. On an error it exits 1 and leaves the snapshot untouched. Verify by running `npm run data:plants`: it writes 117 plants. Then point it at a bad URL (`NVE_API_URL` env override) and verify it exits 1 and leaves the snapshot byte-for-byte unchanged.
- [x] 1.3 Keep the generated `src/data/plants.json` in the repo (not git-ignored), and add `tests/e2e/data.spec.ts`, which runs `validateSnapshot` on it and checks that no record has type pump. Verify the test passes.

## 2. Markers and source note

- [x] 2.1 Implement `src/markers.ts` (`addPlantMarkers`). It draws one circle marker per plant with its `aria-label`, `tabindex` and `data-plant-id`, plus a "Name – N MW" tooltip that opens on hover and on focus. Wire it into `src/main.ts` and expose `window.__plants` and `window.__markers`. Verify that `npm run dev` shows the markers across Norway.
- [x] 2.2 Add the "Source: NVE, data as of <date>" overlay linking to nve.no, styled so it doesn't cover the attribution or zoom controls, even on a 390 px wide screen. Verify visually at desktop and phone widths.
- [x] 2.3 Add `tests/e2e/plants.spec.ts` covering every new `plant-map` scenario: the marker count equals the snapshot count, every marker's position matches its plant, hover shows the name and MW, keyboard focus shows the tooltip, accessible names, and the source note text and link. Add the `plant-data` scenario "NVE is unreachable" by blocking `*.nve.no` and checking all markers still render. Verify `npm run test:e2e` passes, including the slice 1 tests.
- [x] 2.4 Update `README.md` with the `npm run data:plants` command and what it fetches. Verify the documented command runs as written.

## Workflow follow-up

- Verify against both delta specs (osc verify), then archive and sync `plant-data` (new) and `plant-map` (added requirements).
