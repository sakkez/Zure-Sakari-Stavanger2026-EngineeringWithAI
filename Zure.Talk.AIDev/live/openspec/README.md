# Statkraft Hydropower – Environmental Impact at a Glance

A static web page with a map of Norway showing Statkraft's hydropower plants and their environmental impact on surrounding lakes, rivers and forests. Built with Vite, TypeScript and Leaflet. Planned and tracked with OpenSpec (`openspec/`, roadmap in `openspec/osc-roadmap.md`).

## Commands

```bash
npm install                        # install dependencies
npx playwright install chromium    # one-time: browser for end-to-end tests

npm run dev        # dev server at http://localhost:5173
npm run build      # type-check and build the static site to dist/
npm run preview    # serve the built site
npm run test:e2e   # build, serve on port 4317, run the Playwright tests
```

The end-to-end tests stub OpenStreetMap tile requests, so they run offline. The HTML report goes to `playwright-report/`.

## Plant data

```bash
npm run data:plants   # refresh src/data/plants.json from NVE (needs network)
```

The script reads every hydropower plant in operation from NVE's API (`api.nve.no/web/Powerplant/GetHydroPowerPlantsInOperation`) and the plant locations from NVE's map service (`kart.nve.no/.../Vannkraft1/MapServer/0`). It keeps plants where a Statkraft company holds an ownership share and that generate power (pure pumps are left out), and writes a validated snapshot to `src/data/plants.json`. If either source fails or the data fails validation, it exits 1 and leaves the existing snapshot untouched. Commit the refreshed snapshot: the site only reads that file, never NVE directly.
