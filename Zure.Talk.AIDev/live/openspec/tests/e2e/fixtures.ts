import { test as base, expect } from "@playwright/test";

// 1x1 transparent PNG served in place of real map tiles.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

type Fixtures = {
  /** Tile URLs requested by the page, answered locally with a blank PNG. */
  tileRequests: string[];
};

export const test = base.extend<Fixtures>({
  tileRequests: [
    async ({ page }, use) => {
      const requests: string[] = [];
      await page.route(/tile\.openstreetmap\.org/, (route) => {
        requests.push(route.request().url());
        return route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG });
      });
      await use(requests);
    },
    { auto: true },
  ],
});

export { expect };
