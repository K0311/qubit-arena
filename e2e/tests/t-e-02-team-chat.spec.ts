import { startGame, expect, test } from './helpers';

/** T-E-02 — Team 2v2: four contexts, team chat visible only to teammates (rules.md §9). */
test('T-E-02 Team 2v2: team chat is seen by the teammate, never by the other team', async ({
  newPlayer,
}) => {
  // Seats fill P1 (host), P2, P3, P4: Blue is P1 + P2, Red is P3 + P4.
  const [p1, p2, p3, p4] = await startGame(newPlayer, 'team', 'T-E-02');
  for (const p of [p1!, p2!, p3!, p4!]) await expect(p.getByTestId('team-chat')).toBeVisible();
  await expect(p1!.getByTestId('team-chat')).toContainText('BLUE');
  await expect(p3!.getByTestId('team-chat')).toContainText('RED');

  await p1!.getByTestId('team-chat-input').fill('blue plan: H then S');
  await p1!.getByTestId('team-chat-input').press('Enter');
  await expect(p2!.getByTestId('team-chat')).toContainText('blue plan: H then S');

  await p3!.getByTestId('team-chat-input').fill('red secret');
  await p3!.getByTestId('team-chat-input').press('Enter');
  await expect(p4!.getByTestId('team-chat')).toContainText('red secret');

  // A round trip later, the other team still has neither message.
  await expect(p1!.getByTestId('team-chat')).toContainText('blue plan');
  for (const p of [p3!, p4!])
    await expect(p.getByTestId('team-chat')).not.toContainText('blue plan');
  for (const p of [p1!, p2!])
    await expect(p.getByTestId('team-chat')).not.toContainText('red secret');

  // Opponents' hands are a card count only; the teammate's hand is visible (rules.md §9).
  await expect(p1!.getByTestId('opponent-count-P3')).toBeVisible();
  await expect(p1!.getByTestId('opponent-count-P2')).toHaveCount(0);
});
