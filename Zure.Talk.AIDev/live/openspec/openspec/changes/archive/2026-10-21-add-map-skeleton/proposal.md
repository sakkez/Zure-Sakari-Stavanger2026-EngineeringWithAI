# Proposal

## Why

Statkraft needs one web page that shows all of its Norwegian hydropower plants on a map, with their environmental impact. This supports the environmental impact assessments the EU EIA Directive (2011/92/EU, amended by 2014/52/EU, applied in Norway through the EEA) requires when a plant is built or modified. The project has no code yet. This first slice sets up the site and its test harness so that every later slice (plant data, impact scores, detail panel, filters) can be shipped and tested from day one.

## What Changes

- New single-page web site with a header titled "Statkraft Hydropower – Environmental Impact at a Glance".
- An interactive map that opens on mainland Norway and can be panned and zoomed. It uses an OpenStreetMap base layer with visible attribution.
- An end-to-end browser test suite. It loads the page and checks that the header and the map render, with tile requests stubbed so the tests never depend on live tile servers.
- Project scripts to run the dev server, build the static site, and run the end-to-end tests.

## Capabilities

### New Capabilities
- `plant-map`: The at-a-glance map page. It covers the page shell (title and header), the interactive map of Norway and its base layer. Later slices add plant markers, impact coloring, a detail panel and filters to it.

### Modified Capabilities
<!-- None: no specs exist yet. -->

## Impact

- New code at the project root: `package.json`, Vite config, `index.html`, `src/`, `tests/e2e/`, Playwright config.
- New dependencies: `vite`, `typescript`, `leaflet` and `@types/leaflet`, `@playwright/test` (Chromium browser).
- Network at runtime: map tiles from `tile.openstreetmap.org`. Nothing at test time.
