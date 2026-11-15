import { expect, test, type Page } from '@playwright/test';

async function toLobby(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId('mode-solo').click();
}

/** Own room joined by code, so parallel tests using quick match never pair with us. */
async function startSolo(a: Page, b: Page) {
  await toLobby(a);
  await a.getByTestId('lobby-room-name').fill('E2E play');
  await a.getByTestId('lobby-create').click();
  await expect(a).toHaveURL(/\/room\//);
  const code = ((await a.getByTestId('room-code').textContent()) ?? '').replace('CODE', '').trim();
  await toLobby(b);
  await b.getByTestId('lobby-code').fill(code);
  await b.getByRole('button', { name: 'Join', exact: true }).last().click();
  await expect(b).toHaveURL(new RegExp(`/room/${code}`));
  await a.getByTestId('room-ready').click();
  await b.getByTestId('room-ready').click();
  await expect(a.getByTestId('room-ready-count')).toHaveText(/2 \/ 2/);
  await a.getByTestId('room-start').click();
}

test('Solo: the player on turn previews a card, plays it, and the turn passes', async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await startSolo(a, b);
  for (const page of [a, b]) await expect(page.getByTestId('turn-active')).toBeVisible();

  // Exactly one page sees "YOUR TURN".
  const aTurn = (await a.getByTestId('turn-active').textContent())?.includes('YOUR TURN');
  const [mover, watcher] = aTurn ? [a, b] : [b, a];
  const before = (await mover.getByTestId('turn-active').textContent())!.slice(0, 2);

  await expect(mover.getByTestId('board-node-PLUS')).toBeVisible();
  await expect(mover.getByTestId('play-card')).toBeDisabled();
  await mover.getByTestId('hand-card-0').click();
  await expect(mover.getByTestId('preview-line')).not.toBeEmpty();
  await expect(mover.getByTestId('play-card')).toBeEnabled();
  const gate = await mover.getByTestId('hand-card-0').getAttribute('data-gate');
  await mover.getByTestId('play-card').click();

  for (const page of [mover, watcher]) {
    await expect(page.getByTestId('action-log')).toContainText(`${before} played`);
    await expect(page.getByTestId('turn-active')).not.toHaveText(new RegExp(`^${before}`));
  }
  expect(gate).toBeTruthy();
  await expect(watcher.getByTestId('turn-active')).toContainText('YOUR TURN');
});
