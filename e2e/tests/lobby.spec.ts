import { expect, test, type Page } from '@playwright/test';

/** Main menu → mode select → lobby, using the ui-spec §14 test ids. */
async function toLobby(page: Page, mode: 'solo' | 'team') {
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId(`mode-${mode}`).click();
  await expect(page).toHaveURL(new RegExp(`/lobby\\?mode=${mode}`));
}

test('two players meet through quick match and reach the game', async ({ browser }) => {
  // Separate contexts: separate tabs and session tokens, like two people.
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await toLobby(a, 'solo');
  await toLobby(b, 'solo');

  await a.getByTestId('lobby-quick-solo').click();
  await expect(a).toHaveURL(/\/room\//);
  await b.getByTestId('lobby-quick-solo').click();

  for (const page of [a, b]) {
    await expect(page.getByTestId('game-screen')).toBeVisible();
    await expect(page.getByTestId('turn-active')).toHaveText(/P[12]/);
  }
});

test('host creates a room, guest joins by code, both ready, host starts', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await toLobby(host, 'solo');
  await host.getByTestId('lobby-room-name').fill('E2E room');
  await host.getByTestId('lobby-create').click();
  await expect(host).toHaveURL(/\/room\//);
  const code = ((await host.getByTestId('room-code').textContent()) ?? '')
    .replace('CODE', '')
    .trim();
  expect(code).toMatch(/^[A-Z0-9]{3}-\d{2}$/);
  await expect(host.getByTestId('room-start')).toBeDisabled();

  await toLobby(guest, 'solo');
  await guest.getByTestId('lobby-code').fill(code);
  await guest.getByRole('button', { name: 'Join', exact: true }).last().click();
  await expect(guest).toHaveURL(new RegExp(`/room/${code}`));

  await host.getByTestId('room-ready').click();
  await guest.getByTestId('room-ready').click();
  await expect(host.getByTestId('room-ready-count')).toHaveText(/2 \/ 2/);
  await host.getByTestId('room-start').click();

  for (const page of [host, guest]) {
    await expect(page.getByTestId('game-screen')).toBeVisible();
  }
});
