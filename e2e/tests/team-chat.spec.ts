import { expect, test, type Page } from '@playwright/test';

async function toLobby(page: Page) {
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId('mode-team').click();
}

/** T-E-02 (chat part): four players; team chat reaches teammates only (rules.md §9). */
test('Team 2v2: team chat is seen by the teammate, never by the other team', async ({
  browser,
}) => {
  const pages: Page[] = [];
  for (let i = 0; i < 4; i++) pages.push(await (await browser.newContext()).newPage());
  const [host, ...guests] = pages as [Page, Page, Page, Page];

  await toLobby(host);
  await host.getByTestId('lobby-room-name').fill('E2E team chat');
  await host.getByTestId('lobby-create').click();
  await expect(host).toHaveURL(/\/room\//);
  const code = ((await host.getByTestId('room-code').textContent()) ?? '')
    .replace('CODE', '')
    .trim();
  for (const g of guests) {
    await toLobby(g);
    await g.getByTestId('lobby-code').fill(code);
    await g.getByRole('button', { name: 'Join', exact: true }).last().click();
    await expect(g).toHaveURL(new RegExp(`/room/${code}`));
  }
  for (const p of pages) await p.getByTestId('room-ready').click();
  await expect(host.getByTestId('room-ready-count')).toHaveText(/4 \/ 4/);
  await host.getByTestId('room-start').click();
  for (const p of pages) await expect(p.getByTestId('team-chat')).toBeVisible();

  // Seats fill P1 (host), P2, P3, P4: Blue is P1 + P2, Red is P3 + P4.
  const [p1, p2, p3, p4] = pages as [Page, Page, Page, Page];
  await expect(p1.getByTestId('team-chat')).toContainText('BLUE');
  await p1.getByTestId('team-chat-input').fill('blue plan: H then S');
  await p1.getByTestId('team-chat-input').press('Enter');
  await expect(p2.getByTestId('team-chat')).toContainText('blue plan: H then S');

  await p3.getByTestId('team-chat-input').fill('red secret');
  await p3.getByTestId('team-chat-input').press('Enter');
  await expect(p4.getByTestId('team-chat')).toContainText('red secret');

  // A round trip later, the other team still has neither message.
  await expect(p1.getByTestId('team-chat')).toContainText('blue plan');
  for (const p of [p3, p4]) await expect(p.getByTestId('team-chat')).not.toContainText('blue plan');
  for (const p of [p1, p2])
    await expect(p.getByTestId('team-chat')).not.toContainText('red secret');
});
