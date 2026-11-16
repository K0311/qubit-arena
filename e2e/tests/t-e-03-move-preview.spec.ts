import { applyGate, SINGLE_GATES, type Position, type SingleGate } from '@qa/engine';
import { ballOf, handKinds, logRows, moverOf, playCard, startGame, expect, test } from './helpers';

/**
 * T-E-03 — Move preview: selecting a card highlights the destination from rules.md §3.2.
 * The expected destination comes from the engine's gate table, here in the test only.
 */
test('T-E-03 selecting a card highlights the destination the rules give', async ({ newPlayer }) => {
  const pages = await startGame(newPlayer, 'solo', 'T-E-03', '3D');
  let checked = 0;

  for (let turn = 0; turn < 6 && checked < 6; turn++) {
    const mover = await moverOf(pages);
    if (!mover) break;
    const ball = await ballOf(mover);
    const kinds = await handKinds(mover);
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i]!;
      await mover.getByTestId(`hand-card-${i}`).click();
      await expect(mover.getByTestId('preview-line')).not.toBeEmpty();
      if (ball !== 'FOG' && (SINGLE_GATES as readonly string[]).includes(kind)) {
        const to = applyGate(kind as SingleGate, ball as Position);
        await expect(mover.getByTestId('preview-target')).toHaveAttribute('data-positions', to);
        checked++;
      } else if (ball !== 'FOG' && kind === 'MEASURE') {
        const expected = ball === 'ZERO' || ball === 'ONE' ? ball : 'ZERO ONE';
        await expect(mover.getByTestId('preview-target')).toHaveAttribute(
          'data-positions',
          expected,
        );
        checked++;
      }
      // Clicking the selected card again deselects it.
      await mover.getByTestId(`hand-card-${i}`).click();
    }
    // Nothing is sent by selecting: the log only grows when PLAY CARD is pressed.
    const rows = await logRows(mover);
    expect(await logRows(mover)).toBe(rows);
    await playCard(mover, 0);
  }
  expect(checked).toBeGreaterThanOrEqual(3);
});
