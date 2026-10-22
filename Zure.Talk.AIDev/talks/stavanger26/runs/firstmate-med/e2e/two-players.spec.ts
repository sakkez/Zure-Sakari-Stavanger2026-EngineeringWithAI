import { test, expect, type Page } from '@playwright/test';

async function myPos(page: Page) {
  const name = await page.getByTestId('me').textContent();
  const el = page.locator(`[data-testid="player"][data-name="${name}"]`);
  await expect(el).toBeVisible();
  return { name: name!, x: Number(await el.getAttribute('data-x')), y: Number(await el.getAttribute('data-y')) };
}

test('two players join, move, see each other and see a disconnect', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/');
  await b.goto('/');

  await expect(a.getByTestId('me')).not.toHaveText('…');
  await expect(b.getByTestId('me')).not.toHaveText('…');
  const nameA = (await a.getByTestId('me').textContent())!;
  const nameB = (await b.getByTestId('me').textContent())!;
  expect(nameA).not.toBe(nameB);

  // both get into the same round (b may have to wait for a later round)
  await expect(async () => {
    await expect(a.getByTestId('phase')).toHaveText('playing');
    await expect(a.locator(`[data-testid="player"][data-name="${nameB}"]`)).toHaveCount(1);
    await expect(b.locator(`[data-testid="player"][data-name="${nameA}"]`)).toHaveCount(1);
  }).toPass({ timeout: 15000 });
  await expect(a.locator('[data-bot="true"]')).toHaveCount(0);

  // A moves; B sees it
  const before = await myPos(a);
  const key = before.x < 15 ? 'ArrowRight' : 'ArrowLeft';
  const dx = before.x < 15 ? 1 : -1;
  await a.keyboard.press(key);
  const elOnB = b.locator(`[data-testid="player"][data-name="${nameA}"]`);
  await expect(elOnB).toHaveAttribute('data-x', String(before.x + dx));
  await expect(elOnB).toHaveAttribute('data-y', String(before.y));

  // B moves with a button; A sees it
  const bBefore = await myPos(b);
  const dy = bBefore.y < 15 ? 1 : -1;
  await b.getByTestId(dy > 0 ? 'down' : 'up').click();
  const bOnA = a.locator(`[data-testid="player"][data-name="${nameB}"]`);
  await expect(bOnA).toHaveAttribute('data-y', String(bBefore.y + dy));

  // B disconnects; A sees the block go grey, then vanish and A wins
  await expect(bOnA).toHaveAttribute('data-connected', 'true');
  await ctxB.close();
  await expect(bOnA).toHaveAttribute('data-connected', 'false');
  await expect(a.getByTestId('phase')).toHaveText('over', { timeout: 10000 });
  await expect(a.getByTestId('winner')).toHaveText(nameA);
  await expect(a.locator('[data-testid="highscore"]').first()).toHaveAttribute('data-name', nameA);
  await ctxA.close();
});

test('solo player gets a bot, HUD contract present', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('phase')).toHaveText('playing', { timeout: 15000 });
  await expect(page.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(1);
  await expect(page.getByTestId('hp')).toHaveText('100');
  await expect(page.getByTestId('hp-max')).toHaveText('100');
  await expect(page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'false');
  await expect(page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true', { timeout: 3000 });
  await expect(page.getByTestId('rules')).toBeHidden();
  await page.getByTestId('rules-button').click();
  await expect(page.getByTestId('rules').locator('li').first()).toBeVisible();
});

test('reloading within the reconnect window keeps the same name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('me')).not.toHaveText('…');
  const name = await page.getByTestId('me').textContent();
  await page.reload();
  await expect(page.getByTestId('me')).toHaveText(name!);
});
