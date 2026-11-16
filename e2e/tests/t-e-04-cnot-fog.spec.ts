import { ballOf, handKinds, moverOf, playCard, startGame, expect, test } from './helpers';

/**
 * T-E-04 — CNOT: the ball shows fog; Measure brings it back (rules.md §4.3–§4.4).
 * The test steers the game with the cards it is dealt: CNOT from a fog-able position, then
 * Measure (or a second CNOT) while in the fog. Everything else plays a neutral card.
 */
test('T-E-04 CNOT puts the ball in the fog and Measure brings it back', async ({ newPlayer }) => {
  const pages = await startGame(newPlayer, 'solo', 'T-E-04', '3D');
  let sawFog = false;
  let leftFog = false;

  for (let turn = 0; turn < 30 && !(sawFog && leftFog); turn++) {
    const mover = await moverOf(pages);
    if (!mover) break;
    const ball = await ballOf(mover);
    const kinds = await handKinds(mover);
    let pick = kinds.findIndex((k) => k !== 'CNOT' && k !== 'MEASURE');
    if (ball === 'FOG') {
      const measure = kinds.indexOf('MEASURE');
      pick = measure >= 0 ? measure : kinds.indexOf('CNOT');
    } else if (!sawFog && ['ZERO', 'ONE', 'PLUS_I', 'MINUS_I'].includes(ball)) {
      const cnot = kinds.indexOf('CNOT');
      if (cnot >= 0) pick = cnot;
    }
    if (pick < 0) pick = 0;
    const played = kinds[pick];
    await playCard(mover, pick);
    const after = await ballOf(mover);

    if (played === 'CNOT' && ball !== 'FOG' && after === 'FOG') {
      sawFog = true;
      // The board, the state panel and the log all show the fog.
      for (const p of pages) await expect(p.getByTestId('fog')).toHaveCount(1);
      await expect(mover.getByTestId('ball')).toHaveCount(0);
      await expect(mover.getByTestId('state-fog-indicator')).toHaveAttribute('data-fog', 'true');
      await expect(mover.getByTestId('action-log')).toContainText('→ fog');
    }
    if (ball === 'FOG' && after !== 'FOG') {
      leftFog = true;
      for (const p of pages) await expect(p.getByTestId('fog')).toHaveCount(0);
      if (played === 'MEASURE') expect(['ZERO', 'ONE']).toContain(after);
      await expect(mover.getByTestId('state-fog-indicator')).toHaveAttribute('data-fog', 'false');
    }
  }
  expect(sawFog).toBe(true);
  expect(leftFog).toBe(true);
});
