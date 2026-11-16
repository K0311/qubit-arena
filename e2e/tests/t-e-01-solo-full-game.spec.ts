import {
  answerChallengeToEnd,
  isOver,
  moverOf,
  playCard,
  startGame,
  expect,
  test,
} from './helpers';

/**
 * T-E-01 — Solo 1v1: two browser contexts create/join a room and play until the game ends.
 * The e2e server runs with TEST_SEED and an 18-card TEST_DECK, so the game is short.
 */
test('T-E-01 Solo 1v1: two players play a whole game to the result screen', async ({
  newPlayer,
}) => {
  const pages = await startGame(newPlayer, 'solo', 'T-E-01');

  let cards = 0;
  for (let turn = 0; turn < 40 && !(await isOver(pages)); turn++) {
    const mover = await moverOf(pages);
    if (!mover) break;
    await playCard(mover, 0);
    cards++;
  }
  // A tie at the end goes to the Quantum Challenge (rules.md §8); answer until it is decided.
  await answerChallengeToEnd(pages);

  expect(cards).toBeGreaterThan(0);
  for (const p of pages) {
    await expect(p.getByTestId('result-winner')).toBeVisible();
    await expect(p.getByTestId('result-reason')).not.toBeEmpty();
  }
  // Both screens agree on the outcome.
  const winners = await Promise.all(pages.map((p) => p.getByTestId('result-winner').textContent()));
  expect(winners[0]).toBe(winners[1]);
});
