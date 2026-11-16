import { createRoom, expect, joinByCode, test, toLobby } from './helpers';

test('two players meet through quick match and reach the game', async ({ newPlayer }) => {
  // Separate contexts: separate tabs and session tokens, like two people.
  const a = await newPlayer();
  const b = await newPlayer();
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

test('host creates a room, guest joins by code, both ready, host starts', async ({ newPlayer }) => {
  const host = await newPlayer();
  const guest = await newPlayer();
  const code = await createRoom(host, 'solo', 'E2E room');
  expect(code).toMatch(/^[A-Z0-9]{3}-\d{2}$/);
  await expect(host.getByTestId('room-start')).toBeDisabled();

  await joinByCode(guest, 'solo', code);
  await host.getByTestId('room-ready').click();
  await guest.getByTestId('room-ready').click();
  await expect(host.getByTestId('room-ready-count')).toHaveText(/2 \/ 2/);
  await host.getByTestId('room-start').click();

  for (const page of [host, guest]) {
    await expect(page.getByTestId('game-screen')).toBeVisible();
  }
});
