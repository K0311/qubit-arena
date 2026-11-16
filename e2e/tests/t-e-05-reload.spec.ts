import { handKinds, logRows, moverOf, playCard, startGame, expect, test } from './helpers';

/** T-E-05 — Reload during a game → the player returns to the same game (rules.md §10). */
test('T-E-05 a reload during the game puts the player back in the same seat and game', async ({
  newPlayer,
}) => {
  const pages = await startGame(newPlayer, 'solo', 'T-E-05');
  const first = await moverOf(pages);
  expect(first).not.toBeNull();
  await playCard(first!, 0);

  const page = pages[1]!;
  const url = page.url();
  const seat =
    (await page
      .locator('[data-testid^="player-chip-"]', { hasText: 'you' })
      .first()
      .getAttribute('data-testid')) ?? '';
  const hand = await handKinds(page);
  const rows = await logRows(page);

  await page.reload();

  // The session token in sessionStorage brings the same seat and view back.
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.locator(`[data-testid="${seat}"]`)).toContainText('you');
  await expect.poll(() => handKinds(page)).toEqual(hand);
  await expect.poll(() => logRows(page)).toBe(rows);

  // And the game goes on for both players.
  const next = await moverOf(pages);
  expect(next).not.toBeNull();
  await playCard(next!, 0);
  for (const p of pages) await expect.poll(() => logRows(p)).toBeGreaterThan(rows);
});
