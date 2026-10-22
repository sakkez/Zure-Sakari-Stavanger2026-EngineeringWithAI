import { test, expect, type Page } from '@playwright/test';

async function myPos(observer: Page, name: string) {
  const el = observer.locator(`[data-testid="player"][data-name="${name}"]`);
  await expect(el).toHaveCount(1);
  return { x: Number(await el.getAttribute('data-x')), y: Number(await el.getAttribute('data-y')) };
}

test('two players join, see each other move, and see a disconnect', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/');
  await b.goto('/');

  // Joining: each gets a generated name.
  await expect(a.getByTestId('me')).not.toHaveText('…');
  await expect(b.getByTestId('me')).not.toHaveText('…');
  const nameA = (await a.getByTestId('me').textContent())!;
  const nameB = (await b.getByTestId('me').textContent())!;
  expect(nameA).not.toBe(nameB);

  // The round starts with both players and no bot.
  await expect(a.getByTestId('phase')).toHaveText('playing', { timeout: 10_000 });
  await expect(b.getByTestId('phase')).toHaveText('playing');
  await expect(a.getByTestId('player')).toHaveCount(2);
  await expect(b.getByTestId('player')).toHaveCount(2);
  await expect(a.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(0);
  await expect(a.getByTestId('hp')).toHaveText('100');
  await expect(a.getByTestId('hp-max')).toHaveText('100');

  // Moving with the keyboard: B sees A's move.
  const start = await myPos(b, nameA);
  const key = start.x < 29 ? 'ArrowRight' : 'ArrowLeft';
  const expectedX = start.x < 29 ? start.x + 1 : start.x - 1;
  await a.keyboard.press(key);
  await expect(b.locator(`[data-testid="player"][data-name="${nameA}"]`)).toHaveAttribute('data-x', String(expectedX));
  await expect(b.locator(`[data-testid="player"][data-name="${nameA}"]`)).toHaveAttribute('data-y', String(start.y));

  // Moving with the on-screen buttons: A sees B's move.
  const startB = await myPos(a, nameB);
  const btn = startB.y < 29 ? 'down' : 'up';
  await b.getByTestId(btn).click();
  await expect(a.locator(`[data-testid="player"][data-name="${nameB}"]`)).toHaveAttribute(
    'data-y', String(startB.y < 29 ? startB.y + 1 : startB.y - 1));

  // Moving starts the attack wait.
  await expect(a.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true', { timeout: 3000 });

  // Live highscores list both players.
  await expect(a.getByTestId('highscore')).toHaveCount(2);

  // Disconnect: A sees B go offline, then B is eliminated and A wins.
  await ctxB.close();
  await expect(a.locator(`[data-testid="player"][data-name="${nameB}"]`)).toHaveAttribute('data-connected', 'false');
  await expect(a.getByTestId('phase')).toHaveText('over', { timeout: 10_000 });
  await expect(a.getByTestId('winner')).toHaveText(nameA);
  await expect(a.getByTestId('score')).toHaveText('250');
  await expect(a.getByTestId('highscore').first()).toHaveAttribute('data-name', nameA);

  // Next round: A alone gets a bot.
  await expect(a.getByTestId('phase')).toHaveText('playing', { timeout: 15_000 });
  await expect(a.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(1);
  await ctxA.close();
});

test('rules button toggles the rules list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('rules')).toBeHidden();
  await page.getByTestId('rules-button').click();
  await expect(page.getByTestId('rules')).toBeVisible();
  expect(await page.getByTestId('rules').locator('li').count()).toBeGreaterThan(3);
  await page.getByTestId('rules-button').click();
  await expect(page.getByTestId('rules')).toBeHidden();
});
