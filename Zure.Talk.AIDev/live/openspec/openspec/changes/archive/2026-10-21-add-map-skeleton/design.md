# Design

## Context

The project root (`live/openspec`) holds only `openspec/`, `.claude/` and a `.gitignore` that already ignores `node_modules/`, `dist/`, `test-results/` and `playwright-report/`. Node 24 and Playwright 1.64 are available on the machine. See proposal.md for motivation. Later slices will add a committed plant data snapshot (from NVE), impact scoring, a detail panel and filters, so this structure must have room for them.

## Goals / Non-Goals

**Goals:**
- A static site that builds to `dist/` and can be hosted anywhere, with no server.
- Deterministic, offline Playwright tests from the first commit.
- A small module layout that later slices can extend without restructuring.

**Non-Goals:**
- Plant data, markers, impact scoring, panels or filters (slices 2 to 5).
- Deployment or CI pipelines.
- Statkraft branding beyond the header text. We have no brand assets and won't imitate the logo.

## Decisions

- **Vite + vanilla TypeScript, no UI framework.** The page is a map plus a few panels. A framework adds weight without paying for itself at this size. Alternative: React, which the user did not choose.
- **Leaflet with OpenStreetMap tiles.** Leaflet is small and well known, and it's easy to drive in tests. Alternative: MapLibre GL, which needs vector tiles and WebGL. That makes headless testing harder.
- **Layout:** `index.html` → `src/main.ts` (bootstraps) → `src/map.ts` (`createMap(el)` returns the Leaflet map). Styles live in `src/style.css`. Later slices add `src/data/`, `src/impact.ts` and so on.
- **Initial view:** `fitBounds` on a box around mainland Norway (about 57.9–71.2 N, 4.5–31.2 E) instead of a fixed center and zoom, so the whole country fits at any viewport size.
- **Test hook:** `main.ts` assigns the map to `window.__map` so Playwright can read bounds and zoom through `page.evaluate`. The hook is harmless in production and avoids pixel-based assertions.
- **Tile stubbing:** a Playwright fixture routes `https://*.tile.openstreetmap.org/**` and answers with a 1x1 transparent PNG, and records how many requests it served. Tests stay offline and deterministic and can still assert that tiles were requested.
- **Test runner:** `@playwright/test` with Chromium. Its `webServer` runs `vite preview` on the built site (`npm run build` first), so tests check the shipped bundle rather than the dev server. Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test:e2e`.

## Risks / Trade-offs

- [OSM tile usage policy limits heavy use] → Acceptable for an internal at-a-glance tool. The base layer URL lives in one constant, so it can be swapped for a company or paid tile provider later.
- [`window.__map` exposes internals] → Read-only debugging hook with no security impact on a static, data-public page.
- [Testing the built bundle is slower than testing the dev server] → A few seconds at this size. It catches build-only breakage.
