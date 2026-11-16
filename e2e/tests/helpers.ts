import { test as base, expect, type Page } from '@playwright/test';

export { expect };

export type Board = '2D' | '3D';
export type NewPlayer = (
  board?: Board,
  viewport?: { width: number; height: number },
) => Promise<Page>;

/**
 * `newPlayer` gives each player their own browser context (own tab, own session token) and
 * closes them all when the test ends. Without that, finished games stay open in the worker and
 * keep rendering, which slows every later test. Players use the 2D board unless a test asks for
 * 3D: software WebGL in headless Chromium is slow, and T-E-03/T-E-04 cover the 3D test ids.
 */
export const test = base.extend<{ newPlayer: NewPlayer }>({
  newPlayer: async ({ browser }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (board = '2D', viewport = { width: 1280, height: 720 }) => {
      const ctx = await browser.newContext({ viewport });
      contexts.push(ctx);
      await ctx.addInitScript((b) => {
        try {
          const saved = JSON.parse(localStorage.getItem('qa.settings') ?? '{}');
          localStorage.setItem('qa.settings', JSON.stringify({ ...saved, board: b }));
        } catch {
          // Storage blocked: the app falls back to its defaults.
        }
      }, board);
      return ctx.newPage();
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
});

export async function toLobby(page: Page, mode: 'solo' | 'team') {
  await page.goto('/');
  await page.getByTestId('menu-play').click();
  await page.getByTestId(`mode-${mode}`).click();
  await expect(page).toHaveURL(new RegExp(`/lobby\\?mode=${mode}`));
}

/** Host creates a private-by-code room (so parallel tests never meet) and returns its code. */
export async function createRoom(page: Page, mode: 'solo' | 'team', name: string) {
  await toLobby(page, mode);
  await page.getByTestId('lobby-room-name').fill(name);
  await page.getByTestId('lobby-create').click();
  await expect(page).toHaveURL(/\/room\//);
  return ((await page.getByTestId('room-code').textContent()) ?? '').replace('CODE', '').trim();
}

export async function joinByCode(page: Page, mode: 'solo' | 'team', code: string) {
  await toLobby(page, mode);
  await page.getByTestId('lobby-code').fill(code);
  // Submit the code form itself; the room list beside it has Join buttons of its own.
  await page.getByTestId('lobby-code').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/room/${code}`));
}

/** Seats fill in join order: host P1, then P2, P3, P4. Everyone readies, the host starts. */
export async function startGame(
  newPlayer: NewPlayer,
  mode: 'solo' | 'team',
  name: string,
  board: Board = '2D',
  viewport?: { width: number; height: number },
) {
  const count = mode === 'solo' ? 2 : 4;
  const pages: Page[] = [];
  for (let i = 0; i < count; i++) pages.push(await newPlayer(board, viewport));
  const code = await createRoom(pages[0]!, mode, name);
  for (const p of pages.slice(1)) await joinByCode(p, mode, code);
  for (const p of pages) await p.getByTestId('room-ready').click();
  await expect(pages[0]!.getByTestId('room-ready-count')).toHaveText(
    new RegExp(`${count} / ${count}`),
  );
  await pages[0]!.getByTestId('room-start').click();
  for (const p of pages) await expect(p.getByTestId('game-screen')).toBeVisible();
  for (const p of pages) await expect(p.getByTestId('turn-active')).toBeVisible();
  return pages;
}

/** The page whose turn it is, or null once nobody has a turn (Challenge or game over). */
export async function moverOf(pages: Page[], timeoutMs = 10_000): Promise<Page | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const p of pages) {
      // Never wait on a missing element here: a short timeout, then look again.
      const text =
        (await p
          .getByTestId('turn-active')
          .textContent({ timeout: 500 })
          .catch(() => '')) ?? '';
      if (text.includes('YOUR TURN') && (await p.getByTestId('play-card').count()) > 0) return p;
    }
    if (await isOver(pages)) return null;
    await pages[0]!.waitForTimeout(150);
  }
  return null;
}

export async function isOver(pages: Page[]) {
  for (const p of pages) {
    if ((await p.getByTestId('result-winner').count()) > 0) return true;
    if ((await p.getByTestId('challenge-option-0').count()) > 0) return true;
  }
  return false;
}

/** Card kinds in the hand, left to right (data-gate, ui-spec §14). */
export async function handKinds(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const card = page.getByTestId(`hand-card-${i}`);
    if ((await card.count()) === 0) break;
    out.push((await card.getAttribute('data-gate')) ?? '');
  }
  return out;
}

/** Where the server says the ball is: a position, or FOG (rules.md §4.4: no position). */
export async function ballOf(page: Page): Promise<string> {
  if ((await page.getByTestId('fog').count()) > 0) return 'FOG';
  return (await page.getByTestId('ball').getAttribute('data-position')) ?? '';
}

export const logRows = (page: Page) =>
  page.getByTestId('action-log').locator('li.log__row').count();

/** Select the card at `index`, press PLAY CARD, and wait until the server has taken it. */
export async function playCard(page: Page, index: number) {
  const before = await logRows(page);
  await page.getByTestId(`hand-card-${index}`).click();
  await expect(page.getByTestId('play-card')).toBeEnabled();
  await page.getByTestId('play-card').click();
  await expect.poll(() => logRows(page)).toBeGreaterThan(before);
}

/**
 * Answer Challenge questions until the result shows (rules.md §8.1). Blue picks A and Red picks
 * B: two sides giving the same answer can never break a tie, and sudden death would run forever.
 */
export async function answerChallengeToEnd(pages: Page[]) {
  // Pages are in seat order: Solo P1 (Blue), P2 (Red); Team P1, P2 (Blue), P3, P4 (Red).
  const choiceOf = (i: number) => (pages.length === 4 ? (i < 2 ? 0 : 1) : i % 2);
  for (let round = 0; round < 60; round++) {
    if ((await pages[0]!.getByTestId('result-winner').count()) > 0) return;
    let answered = false;
    for (const [i, p] of pages.entries()) {
      const option = p.getByTestId(`challenge-option-${choiceOf(i)}`);
      if ((await option.count()) > 0 && (await option.isEnabled())) {
        await option.click();
        answered = true;
      }
    }
    await pages[0]!.waitForTimeout(answered ? 600 : 400);
  }
}
