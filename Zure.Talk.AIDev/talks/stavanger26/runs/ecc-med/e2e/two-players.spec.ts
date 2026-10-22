import { expect, test, type Browser, type Page } from '@playwright/test';

async function joinPlayer(browser: Browser): Promise<{ page: Page; name: string; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('me')).not.toHaveText('…');
  const name = (await page.getByTestId('me').textContent()) ?? '';
  return { page, name, close: () => context.close() };
}

function playerBlock(page: Page, name: string) {
  return page.locator(`[data-testid="player"][data-name="${name}"]`);
}

async function position(page: Page, name: string): Promise<{ x: number; y: number }> {
  const block = playerBlock(page, name);
  return { x: Number(await block.getAttribute('data-x')), y: Number(await block.getAttribute('data-y')) };
}

test('two players join, see each other move, and see a disconnect', async ({ browser }) => {
  const alice = await joinPlayer(browser);
  const bob = await joinPlayer(browser);
  expect(alice.name).not.toBe(bob.name);

  await expect(alice.page.getByTestId('phase')).toHaveText('playing', { timeout: 15_000 });
  await expect(bob.page.getByTestId('phase')).toHaveText('playing', { timeout: 15_000 });

  // Both see both players in the arena (each round with 2 humans has no bot).
  await expect(playerBlock(alice.page, bob.name)).toBeVisible();
  await expect(playerBlock(bob.page, alice.name)).toBeVisible();
  await expect(alice.page.locator('[data-testid="player"][data-bot="true"]')).toHaveCount(0);
  await expect(alice.page.getByTestId('hp')).toHaveText('100');
  await expect(alice.page.getByTestId('hp-max')).toHaveText('100');
  await expect(alice.page.getByTestId('grid')).toBeVisible();

  // Alice moves by keyboard; Bob sees it.
  const start = await position(bob.page, alice.name);
  const dir = start.y > 0 ? { key: 'ArrowUp', dy: -1 } : { key: 'ArrowDown', dy: 1 };
  await alice.page.keyboard.press(dir.key);
  await expect(playerBlock(bob.page, alice.name)).toHaveAttribute('data-y', String(start.y + dir.dy));
  await expect(playerBlock(bob.page, alice.name)).toHaveAttribute('data-x', String(start.x));

  // Bob moves with the on-screen button; Alice sees it.
  const bobStart = await position(alice.page, bob.name);
  const button = bobStart.x > 0 ? { id: 'left', dx: -1 } : { id: 'right', dx: 1 };
  await bob.page.getByTestId(button.id).click();
  await expect(playerBlock(alice.page, bob.name)).toHaveAttribute('data-x', String(bobStart.x + button.dx));

  // Moving starts the attack cooldown.
  await expect(alice.page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true', { timeout: 3000 });

  // Bob disconnects: Alice sees him greyed out, then gone, and wins the round.
  await bob.close();
  await expect(playerBlock(alice.page, bob.name)).toHaveAttribute('data-connected', 'false');
  await expect(alice.page.getByTestId('events')).toContainText(`${bob.name} disconnected`);
  await expect(playerBlock(alice.page, bob.name)).toHaveCount(0, { timeout: 10_000 });
  await expect(alice.page.getByTestId('phase')).toHaveText('over');
  await expect(alice.page.getByTestId('winner')).toHaveText(alice.name);
  await expect(alice.page.getByTestId('highscores').getByTestId('highscore').first()).toHaveAttribute('data-name', alice.name);
  await alice.close();
});

test('players can fight: damage shows as dealt and taken', async ({ browser }) => {
  const alice = await joinPlayer(browser);
  const bob = await joinPlayer(browser);
  await expect(alice.page.getByTestId('phase')).toHaveText('playing', { timeout: 15_000 });

  // Walk Alice next to Bob, one step at a time, respecting the move rate limit.
  for (let i = 0; i < 80; i++) {
    const a = await position(alice.page, alice.name);
    const b = await position(alice.page, bob.name);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) break;
    const key = Math.abs(dx) > 1 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await alice.page.keyboard.press(key);
    await alice.page.waitForTimeout(220);
  }
  await expect(alice.page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'true', { timeout: 3000 });
  await alice.page.keyboard.press('Space');

  await expect(bob.page.getByTestId('hp')).toHaveText('75');
  await expect(alice.page.locator(`[data-testid="damage"][data-kind="dealt"][data-target="${bob.name}"]`).first()).toBeAttached();
  await expect(bob.page.locator(`[data-testid="damage"][data-kind="taken"][data-target="${bob.name}"]`).first()).toBeAttached();
  await expect(alice.page.getByTestId('cooldown')).toHaveAttribute('data-ready', 'false');
  await expect(playerBlock(alice.page, bob.name)).toHaveAttribute('data-hp', '75');

  await alice.page.getByTestId('rules-button').click();
  await expect(alice.page.getByTestId('rules').locator('li').first()).toBeVisible();
  await alice.close();
  await bob.close();
});
