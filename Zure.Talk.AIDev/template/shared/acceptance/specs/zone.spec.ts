import { test, expect, pair, phase, number, walkTo, highscores } from "../fixtures";

test.describe("the zone", () => {
  // A shrink a second: the 4 by 4 middle after 13 seconds. A long result, to read the scores.
  test.use({ gameEnv: { ZONE_INTERVAL_MS: "1000", RESULT_MS: "10000" } });

  test("shrinks to the middle 4 by 4, hurts only those outside it, and pays 10 a shrink to the living", async ({ browser, game }) => {
    test.setTimeout(90_000);
    const [a, b] = await pair(browser, game.url);

    // B goes to the middle and waits there. A waits just outside the final square, at
    // (10, 14): the zone passes A after 11 shrinks, so A outlives all 13 and dies about
    // 10 seconds later.
    await Promise.all([walkTo(b, { x: 15, y: 15 }), walkTo(a, { x: 10, y: 14 })]);

    const zone = a.page.getByTestId("zone");
    await expect(zone).toHaveAttribute("data-x0", "13", { timeout: 20_000 });
    for (const [k, v] of [["data-y0", "13"], ["data-x1", "16"], ["data-y1", "16"]]) await expect(zone).toHaveAttribute(k, v);
    await a.page.waitForTimeout(2000);
    await expect(zone, "it stops at 4 by 4").toHaveAttribute("data-x0", "13");

    // Outside: 10 a second. Inside: nothing.
    const hpA = await number(a.page, "hp"), hpB = await number(b.page, "hp");
    expect(hpA % 10).toBe(0);
    await a.page.waitForTimeout(2500);
    const hpA2 = await number(a.page, "hp");
    expect(hpA2).toBeLessThan(hpA);
    expect(hpA2 % 10).toBe(0);
    expect(await number(b.page, "hp")).toBe(hpB);

    // A dies in the zone. Both lived through all 13 shrinks; B wins and nobody gets a kill.
    await phase(b, "over", 30_000);
    await expect(b.page.getByTestId("winner")).toHaveText(b.name);
    await expect(a.page.getByTestId("score")).toHaveText("130");
    await expect(b.page.getByTestId("score")).toHaveText("380");
    expect(await highscores(b.page)).toEqual([{ name: b.name, score: 380 }, { name: a.name, score: 130 }]);
  });
});
