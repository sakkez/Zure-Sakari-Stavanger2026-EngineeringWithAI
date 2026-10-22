import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import snapshotJson from "../../src/data/plants.json" with { type: "json" };
import type { PlantSnapshot } from "../../src/data/plants";

const snapshot = snapshotJson as PlantSnapshot;
const kvilldal = snapshot.plants.find((p) => p.name === "Kvilldal")!;

async function openMap(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__markers !== undefined);
}

test.describe("Requirement: One marker per plant", () => {
  test("All plants are on the map", async ({ page }) => {
    await openMap(page);
    await expect(page.locator(".plant-marker")).toHaveCount(snapshot.plants.length);

    const positions = await page.evaluate(() =>
      [...window.__markers!].map(([id, m]) => ({ id, ...m.getLatLng() })),
    );
    expect(positions).toHaveLength(snapshot.plants.length);
    for (const plant of snapshot.plants) {
      const pos = positions.find((p) => p.id === plant.id);
      expect(pos, `marker for ${plant.name}`).toBeDefined();
      expect(pos!.lat).toBeCloseTo(plant.lat, 6);
      expect(pos!.lng).toBeCloseTo(plant.lon, 6);
    }
  });
});

test.describe("Requirement: Marker identifies the plant", () => {
  test("Hover shows name and capacity", async ({ page }) => {
    await openMap(page);
    // Zoom in on the plant so neighbouring markers don't overlap it.
    await page.evaluate(([lat, lon]) => window.__map!.setView([lat, lon], 10, { animate: false }), [kvilldal.lat, kvilldal.lon]);
    await page.locator(`[data-plant-id="${kvilldal.id}"]`).hover();
    await expect(page.locator(".leaflet-tooltip")).toHaveText(`Kvilldal – ${kvilldal.maxOutputMw} MW`);
  });

  test("Keyboard focus shows the tooltip", async ({ page }) => {
    await openMap(page);
    await page.locator(`[data-plant-id="${kvilldal.id}"]`).focus();
    await expect(page.locator(".leaflet-tooltip")).toHaveText(`Kvilldal – ${kvilldal.maxOutputMw} MW`);
    await page.locator(`[data-plant-id="${kvilldal.id}"]`).blur();
    await expect(page.locator(".leaflet-tooltip")).toHaveCount(0);
  });

  test("Marker is reachable by name", async ({ page }) => {
    await openMap(page);
    await expect(page.getByRole("button", { name: /^Kvilldal –/ })).toHaveCount(1);
    for (const plant of snapshot.plants) {
      await expect(page.locator(`[data-plant-id="${plant.id}"]`)).toHaveAttribute(
        "aria-label",
        new RegExp(plant.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  });
});

test.describe("Requirement: Data source is shown", () => {
  test("Source note is visible", async ({ page }) => {
    await openMap(page);
    const note = page.locator(".data-source");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(`Source: NVE, data as of ${snapshot.fetchedAt}`);
    await expect(note.getByRole("link", { name: "NVE" })).toHaveAttribute("href", /^https:\/\/www\.nve\.no\//);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("source note doesn't cover the controls", async ({ page }) => {
      await openMap(page);
      const note = (await page.locator(".data-source").boundingBox())!;
      for (const sel of [".leaflet-control-zoom", ".leaflet-control-attribution"]) {
        const c = (await page.locator(sel).boundingBox())!;
        const overlaps = note.x < c.x + c.width && c.x < note.x + note.width && note.y < c.y + c.height && c.y < note.y + note.height;
        expect(overlaps, `source note overlaps ${sel}`).toBe(false);
      }
    });
  });
});

test.describe("Requirement: Site uses the committed snapshot", () => {
  test("NVE is unreachable", async ({ page }) => {
    const nveRequests: string[] = [];
    await page.route(/nve\.no/, (route) => {
      nveRequests.push(route.request().url());
      return route.abort();
    });
    await openMap(page);
    await expect(page.locator(".plant-marker")).toHaveCount(snapshot.plants.length);
    expect(nveRequests).toEqual([]);
  });
});
