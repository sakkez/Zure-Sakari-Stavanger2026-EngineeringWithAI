import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const HEADER = "Statkraft Hydropower – Environmental Impact at a Glance";

async function openMap(page: Page) {
  await page.goto("/");
  await expect(page.locator("#map.leaflet-container")).toBeVisible();
  await page.waitForFunction(() => window.__map !== undefined);
}

test.describe("Requirement: Page identifies the site", () => {
  test("Visitor opens the site", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADER);
    await expect(page).toHaveTitle(/Environmental Impact at a Glance/);
  });
});

test.describe("Requirement: Map opens on Norway", () => {
  test("Initial view covers mainland Norway", async ({ page }) => {
    await openMap(page);
    const box = await page.locator("#map").boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    const b = await page.evaluate(() => {
      const bounds = window.__map!.getBounds();
      return { s: bounds.getSouth(), n: bounds.getNorth(), w: bounds.getWest(), e: bounds.getEast() };
    });
    expect(b.s).toBeLessThanOrEqual(58.0);
    expect(b.n).toBeGreaterThanOrEqual(71.1);
    expect(b.w).toBeLessThanOrEqual(5.0);
    expect(b.e).toBeGreaterThanOrEqual(31.0);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Map fills the viewport on a phone", async ({ page }) => {
      await openMap(page);
      const box = await page.locator("#map").boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(390 - 1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});

test.describe("Requirement: Map is navigable", () => {
  test("Zoom in with the control", async ({ page }) => {
    await openMap(page);
    const before = await page.evaluate(() => window.__map!.getZoom());
    const zoomed = page.evaluate(
      () => new Promise<void>((resolve) => window.__map!.once("zoomend", () => resolve())),
    );
    await page.locator(".leaflet-control-zoom-in").click();
    await zoomed;
    const after = await page.evaluate(() => window.__map!.getZoom());
    expect(after).toBeCloseTo(before + 1, 5);
  });
});

test.describe("Requirement: Base map with attribution", () => {
  test("Attribution is shown", async ({ page }) => {
    await openMap(page);
    await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap contributors");
  });

  test("Base layer tiles are requested", async ({ page, tileRequests }) => {
    await openMap(page);
    await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  });
});
