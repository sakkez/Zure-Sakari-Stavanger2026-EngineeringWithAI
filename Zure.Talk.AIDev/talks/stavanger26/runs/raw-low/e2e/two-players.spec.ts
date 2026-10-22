import { test, expect, Page } from '@playwright/test';

async function pos(page: Page, name: string) {
  const el = page.locator(`[data-testid=player][data-name="${name}"]`);
  return { x: Number(await el.getAttribute('data-x')), y: Number(await el.getAttribute('data-y')) };
}

test('two players join, see each other move, and see a disconnect', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  await a.goto('/'); await b.goto('/');
  await expect(a.getByTestId('me')).not.toHaveText('…');
  await expect(b.getByTestId('me')).not.toHaveText('…');
  const nameA = await a.getByTestId('me').innerText(), nameB = await b.getByTestId('me').innerText();
  expect(nameA).not.toBe(nameB);

  await expect(a.getByTestId('phase')).toHaveText('playing', { timeout: 10000 });
  await expect(b.getByTestId('phase')).toHaveText('playing');
  await expect(a.getByTestId('player')).toHaveCount(2);
  await expect(a.locator('[data-testid=player][data-bot=true]')).toHaveCount(0);
  await expect(a.getByTestId('hp')).toHaveText('100');
  await expect(a.getByTestId('hp-max')).toHaveText('100');

  // B moves; A sees it. Pick a direction away from the edge.
  const start = await pos(b, nameB);
  const [key, dx] = start.x < 15 ? ['ArrowRight', 1] : ['ArrowLeft', -1];
  await b.keyboard.press(key);
  await expect(a.locator(`[data-testid=player][data-name="${nameB}"]`)).toHaveAttribute('data-x', String(start.x + dx));
  // A moves with on-screen button; B sees it.
  const sa = await pos(a, nameA);
  const btn = sa.y < 15 ? 'down' : 'up';
  await a.getByTestId(btn).click();
  await expect(b.locator(`[data-testid=player][data-name="${nameA}"]`)).toHaveAttribute('data-y', String(sa.y + (btn === 'down' ? 1 : -1)));

  // cooldown shows not ready right after a move
  await expect(a.getByTestId('cooldown')).toHaveAttribute('data-ready', /true|false/);

  // rules toggle
  await expect(a.getByTestId('rules')).toBeHidden();
  await a.getByTestId('rules-button').click();
  await expect(a.getByTestId('rules').locator('li').first()).toBeVisible();

  // B disconnects: A sees B removed and the round ends with A winning.
  await ctxB.close();
  await expect(a.locator(`[data-testid=player][data-name="${nameB}"]`)).toHaveCount(0, { timeout: 8000 });
  await expect(a.getByTestId('phase')).toHaveText('over');
  await expect(a.getByTestId('winner')).toHaveText(nameA);
  await expect(a.locator(`[data-testid=highscore][data-name="${nameA}"]`)).toHaveCount(1);
  await ctxA.close();
});

test('two players fight: attack deals damage both sides see', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  await a.goto('/'); await b.goto('/');
  await expect(a.getByTestId('phase')).toHaveText('playing', { timeout: 15000 });
  const nameA = await a.getByTestId('me').innerText(), nameB = await b.getByTestId('me').innerText();
  // walk A towards B until adjacent
  for (let i = 0; i < 80; i++) {
    const pa = await pos(a, nameA), pb = await pos(b, nameB);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) break;
    const key = Math.abs(dx) > 1 || (Math.abs(dy) <= 1 && dx !== 0) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await a.keyboard.press(key);
    await a.waitForTimeout(150);
  }
  await expect(a.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true', { timeout: 3000 });
  await a.keyboard.press('Space');
  await expect(b.getByTestId('hp')).toHaveText('75');
  await expect(b.locator(`[data-testid=player][data-name="${nameB}"]`)).toHaveAttribute('data-hp', '75');
  await expect(a.locator(`[data-testid=damage][data-kind=dealt][data-target="${nameB}"]`)).toHaveCount(1);
  await expect(b.locator(`[data-testid=damage][data-kind=taken]`)).toHaveCount(1);
  await ctxA.close(); await ctxB.close();
});
