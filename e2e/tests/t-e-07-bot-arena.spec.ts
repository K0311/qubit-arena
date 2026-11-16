import { answerChallengeToEnd, expect, isOver, moverOf, playCard, test } from './helpers';

/**
 * T-E-07 — Bot Arena: one player picks "Solo vs Bot" on the mode select and plays a whole game
 * against the server bot (rules.md §10 bot) without anyone else joining.
 */
test('T-E-07 Bot Arena: one player plays a whole Solo game against a bot', async ({
  newPlayer,
}) => {
  const page = await newPlayer();
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId('mode-bot-solo').click();
  await expect(page).toHaveURL(/\/game\//);
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.getByTestId('player-chip-P2')).toContainText('bot');

  let cards = 0;
  for (let turn = 0; turn < 40 && !(await isOver([page])); turn++) {
    const mover = await moverOf([page], 15_000);
    if (!mover) break;
    await playCard(mover, 0);
    cards++;
  }
  await answerChallengeToEnd([page]);

  expect(cards).toBeGreaterThan(0);
  await expect(page.getByTestId('result-winner')).toBeVisible();
  // The bot played its own cards: P2 rows in the action log.
  await expect(page.getByTestId('action-log')).toContainText('P2');
});
