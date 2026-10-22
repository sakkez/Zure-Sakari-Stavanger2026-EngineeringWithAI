import { test, expect, type Page, type Browser } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function join(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByTestId("me")).not.toHaveText("…");
  const name = (await page.getByTestId("me").textContent())!;
  return { ctx, page, name };
}

const playerEl = (page: Page, name: string) => page.locator(`[data-testid="player"][data-name="${name}"]`);

async function pos(page: Page, name: string) {
  const el = playerEl(page, name);
  return { x: Number(await el.getAttribute("data-x")), y: Number(await el.getAttribute("data-y")) };
}

test("two players join, see each other move and see a disconnect", async ({ browser }) => {
  const a = await join(browser);
  const b = await join(browser);
  expect(a.name).not.toBe(b.name);

  // both end up in the same round, without a bot
  for (const p of [a, b]) {
    await expect(p.page.getByTestId("phase")).toHaveText("playing", { timeout: 15_000 });
    await expect(p.page.getByTestId("player")).toHaveCount(2);
    await expect(p.page.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(0);
    await expect(p.page.getByTestId("hp")).toHaveText("100");
    await expect(p.page.getByTestId("hp-max")).toHaveText("100");
    await expect(p.page.getByTestId("score")).toHaveText("0");
  }

  // A moves; B sees it
  const start = await pos(b.page, a.name);
  const key = start.x < 15 ? "ArrowRight" : "ArrowLeft";
  const dx = start.x < 15 ? 1 : -1;
  await a.page.keyboard.press(key);
  await expect(playerEl(b.page, a.name)).toHaveAttribute("data-x", String(start.x + dx));
  await expect(playerEl(b.page, a.name)).toHaveAttribute("data-y", String(start.y));

  // B moves with the on-screen button; A sees it
  const bStart = await pos(a.page, b.name);
  const btn = bStart.y < 15 ? "down" : "up";
  await b.page.getByTestId(btn).click();
  await expect(playerEl(a.page, b.name)).toHaveAttribute("data-y", String(bStart.y + (btn === "down" ? 1 : -1)));

  // attacking starts the cooldown
  const cd = a.page.getByTestId("cooldown");
  await expect(cd).toHaveAttribute("data-ready", "true");
  await a.page.keyboard.press("Space");
  await expect(cd).toHaveAttribute("data-ready", "false");
  await expect(cd).toHaveAttribute("data-ready", "true", { timeout: 3000 });

  // B reloads and keeps the same identity
  await b.page.reload();
  await expect(b.page.getByTestId("me")).toHaveText(b.name);
  await expect(b.page.getByTestId("player")).toHaveCount(2);

  // B disconnects: A sees B go offline, then eliminated, and A wins
  await b.ctx.close();
  await expect(playerEl(a.page, b.name)).toHaveAttribute("data-connected", "false");
  await expect(a.page.locator(`#online li[data-name="${b.name}"]`)).toHaveAttribute("data-connected", "false");
  await expect(a.page.getByTestId("phase")).toHaveText("over", { timeout: 10_000 });
  await expect(a.page.getByTestId("winner")).toHaveText(a.name);
  await expect(a.page.getByTestId("score")).toHaveText("250");
  await expect(a.page.getByTestId("highscore").first()).toHaveAttribute("data-name", a.name);
  await expect(a.page.getByTestId("highscore").first()).toHaveAttribute("data-score", "250");
  await expect(a.page.locator(`#online li[data-name="${b.name}"]`)).toHaveCount(0);
  await a.ctx.close();
});

test("a lone player gets a bot and a late joiner waits", async ({ browser }) => {
  const a = await join(browser);
  await expect(a.page.getByTestId("phase")).toHaveText("playing", { timeout: 15_000 });
  await expect(a.page.getByTestId("player")).toHaveCount(2);
  await expect(a.page.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(1);

  const late = await join(browser);
  await expect(late.page.getByTestId("phase")).toHaveText("playing");
  await expect(late.page.getByTestId("player")).toHaveCount(2);
  await expect(playerEl(late.page, late.name)).toHaveCount(0);

  // rules toggle
  await expect(a.page.getByTestId("rules")).toBeHidden();
  await a.page.getByTestId("rules-button").click();
  await expect(a.page.getByTestId("rules")).toBeVisible();
  expect(await a.page.locator('[data-testid="rules"] li').count()).toBeGreaterThan(3);

  // zone and grid exist
  await expect(a.page.getByTestId("zone")).toHaveAttribute("data-x0", "0");
  await expect(a.page.getByTestId("zone")).toHaveAttribute("data-x1", "29");
  await a.ctx.close();
  await late.ctx.close();
});
