import type { Page } from '@playwright/test';
import {
  answerChallengeToEnd,
  createRoom,
  expect,
  handKinds,
  isOver,
  joinByCode,
  moverOf,
  playCard,
  startGame,
  test,
  toLobby,
} from '../tests/helpers';

/**
 * P-4.4: a screenshot of every screen in ui-spec §3 at 1920 × 1080, saved to e2e/screenshots/
 * for comparison with docs/ui-spec.md and docs/design/. Run with `pnpm --filter @qa/e2e
 * screens`; it is not part of `pnpm e2e`.
 */
const HD = { width: 1920, height: 1080 };
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `screenshots/${name}.png`, animations: 'disabled' });

test('menus, lobby, room and the pages around the game', async ({ newPlayer }) => {
  const p = await newPlayer('3D', HD);
  await p.goto('/');
  await expect(p.getByTestId('menu-play')).toBeVisible();
  await shot(p, '01-main-menu');
  await p.getByTestId('menu-play').click();
  // Wait for the screen itself: shooting straight after the click caught the main menu.
  await expect(p.getByTestId('mode-bot')).toBeVisible();
  await p.waitForTimeout(400);
  await shot(p, '02-mode-select');
  await toLobby(p, 'solo');
  await p.waitForTimeout(800);
  await shot(p, '03-lobby');
  await createRoom(p, 'solo', 'Screenshot room');
  await shot(p, '04-room-host');
  const guest = await newPlayer('3D', HD);
  await joinByCode(
    guest,
    'solo',
    ((await p.getByTestId('room-code').textContent()) ?? '').replace('CODE', '').trim(),
  );
  await guest.getByTestId('room-ready').click();
  await shot(guest, '05-room-guest');

  for (const [path, name] of [
    ['/settings', '20-settings'],
    ['/about', '21-about-card-library'],
    ['/tutorial', '22-tutorial-placeholder'],
  ] as const) {
    const page = await newPlayer('3D', HD);
    await page.goto(path);
    await page.waitForTimeout(500);
    await shot(page, name);
  }
});

/** Play non-scoring cards so the game ends tied 0 : 0 and goes to the Quantum Challenge. */
async function playToTheEnd(pages: Page[]) {
  for (let turn = 0; turn < 40 && !(await isOver(pages)); turn++) {
    const mover = await moverOf(pages);
    if (!mover) break;
    const kinds = await handKinds(mover);
    let pick = 0;
    for (let i = 0; i < kinds.length; i++) {
      await mover.getByTestId(`hand-card-${i}`).click();
      const line = (await mover.getByTestId('preview-line').textContent()) ?? '';
      await mover.getByTestId(`hand-card-${i}`).click();
      if (!line.includes('TOUCHDOWN')) {
        pick = i;
        break;
      }
    }
    await playCard(mover, pick);
  }
}

test('Solo game on the 3D board: move preview, fog, Challenge and result', async ({
  newPlayer,
}) => {
  const pages = await startGame(newPlayer, 'solo', 'Screenshot solo', '3D', HD);
  await pages[0]!.waitForTimeout(3500); // opening roll and kickoff
  await shot(pages[0]!, '10-game-solo-3d-blue');
  await shot(pages[1]!, '11-game-solo-3d-red');

  const mover = (await moverOf(pages))!;
  await mover.getByTestId('hand-card-0').click();
  await mover.waitForTimeout(400);
  await shot(mover, '12-game-move-preview');
  await mover.getByTestId('hand-card-0').hover();
  await mover.waitForTimeout(700);
  await shot(mover, '13-game-card-hover-detail');
  await mover.getByTestId('hand-card-0').click();

  await playToTheEnd(pages);
  const challenge = pages[0]!.getByTestId('challenge-option-0');
  if ((await challenge.count()) > 0) {
    await shot(pages[0]!, '14-quantum-challenge');
    // Blue answers A, Red answers B, so the reveal shows one side right and one wrong.
    await pages[0]!.getByTestId('challenge-option-0').click();
    await pages[1]!.getByTestId('challenge-option-1').click();
    await pages[0]!.waitForTimeout(500);
    await shot(pages[0]!, '15-quantum-challenge-reveal');
    await answerChallengeToEnd(pages);
  }
  await expect(pages[0]!.getByTestId('result-winner')).toBeVisible();
  await pages[0]!.waitForTimeout(600);
  await shot(pages[0]!, '16-result');
});

test('Team game, 2D board and a spectator', async ({ newPlayer }) => {
  const pages = await startGame(newPlayer, 'team', 'Screenshot team', '3D', HD);
  await pages[0]!.waitForTimeout(3500);
  await shot(pages[0]!, '17-game-team-3d');

  const flat = await startGame(newPlayer, 'solo', 'Screenshot 2D', '2D', HD);
  await flat[0]!.waitForTimeout(2500);
  await shot(flat[0]!, '18-game-solo-2d');

  const spectator = await newPlayer('3D', HD);
  await toLobby(spectator, 'team');
  await spectator.waitForTimeout(3500); // the room list polls every 3 s
  const watch = spectator.getByRole('button', { name: 'Watch' }).first();
  if ((await watch.count()) > 0) {
    await watch.click();
    await expect(spectator.getByTestId('game-screen')).toBeVisible();
    await spectator.waitForTimeout(2500);
    await shot(spectator, '19-game-spectator');
  }
});
