# Tasks

## 1. Project setup

- [x] 1.1 Create `package.json` with scripts `dev`, `build` (`tsc --noEmit && vite build`), `preview` and `test:e2e`, plus `tsconfig.json`. Add `vite`, `typescript`, `leaflet`, `@types/leaflet` and `@playwright/test`. Verify `npm install` succeeds.
- [x] 1.2 Install the Playwright Chromium browser (`npx playwright install chromium`) and verify `npx playwright --version` runs.

## 2. Page shell and map

- [x] 2.1 Create `index.html` with the document title and header "Statkraft Hydropower – Environmental Impact at a Glance", plus `src/style.css` with a full-height layout (header, then a map that fills the rest, no horizontal scroll). Verify `npm run build` succeeds.
- [x] 2.2 Implement `src/map.ts` (`createMap`). It creates a Leaflet map, adds the OpenStreetMap tile layer with the "© OpenStreetMap contributors" attribution and zoom controls, and fits the bounds of mainland Norway. Wire it up in `src/main.ts`, exposing `window.__map`. Verify that `npm run dev` shows the map of Norway.

## 3. End-to-end tests

- [x] 3.1 Add `playwright.config.ts` (Chromium; `webServer` runs build + `vite preview`) and a fixture in `tests/e2e/fixtures.ts` that stubs OSM tile requests with a transparent PNG and counts them. Verify the config loads with `npx playwright test --list`.
- [x] 3.2 Write `tests/e2e/map.spec.ts` covering every scenario in `specs/plant-map/spec.md`: header and title, initial bounds over Norway, phone viewport with no horizontal scroll, the zoom-in control, attribution text, and tile requests. Verify `npm run test:e2e` passes with all tests green.
- [x] 3.3 Add a short `README.md` with the commands for dev, build and tests, and verify each documented command runs as written.

## Workflow follow-up

- Verify against the spec (osc verify), then archive the change and sync the `plant-map` spec.
