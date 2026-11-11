import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '@qa/engine';
import { ManualScheduler } from '../src/scheduler';
import type { RunningServer } from '../src/server';
import { closeAll, startTable, TestClient, withServer, type Table } from './helpers';

let server: RunningServer;
let clock: ManualScheduler;
const open: TestClient[] = [];

async function table(
  mode: 'SOLO' | 'TEAM',
  settings?: Parameters<typeof startTable>[2],
): Promise<Table> {
  clock = new ManualScheduler();
  server = await withServer({ scheduler: clock });
  const t = await startTable(server.port, mode, settings);
  open.push(...Object.values(t.clients));
  return t;
}

afterEach(async () => {
  await closeAll(open.splice(0));
  await server?.close();
});

const other = (p: PlayerId): PlayerId => (p === 'P1' ? 'P2' : 'P1');

/** A round trip proves every message sent before it has arrived. */
const flush = (c: TestClient) => c.request({ type: 'PING', t: 0 }, 'PONG');

describe('T-S-06 disconnect, reconnect and bot seat (rules.md §10)', () => {
  it('keeps the seat, gives the same view back, and a bot plays after 30 s', async () => {
    const t = await table('SOLO');
    const turn = (await t.host.waitFor('GAME_VIEW')).view.turn;
    const watcher = t.clients[other(turn)];
    const mover = t.clients[turn];
    const before = await mover.waitFor('GAME_VIEW');
    await watcher.waitFor('GAME_VIEW');
    const token = mover.token;

    const start = watcher.messages.length;
    await mover.close();
    const gone = await watcher.waitFor(
      'ROOM_STATE',
      (m) => m.room.seats[turn]?.connected === false,
      start,
    );
    expect(gone.room.seats[turn]).toMatchObject({ name: turn, connected: false, bot: false });

    // Same token → same session, same seat, same view.
    const back = await TestClient.connect(server.port, token);
    open.push(back);
    expect(back.token).toBe(token);
    expect((await back.waitFor('ROOM_STATE')).you.seat).toBe(turn);
    expect((await back.waitFor('GAME_VIEW')).view).toEqual(before.view);
    await watcher.waitFor('ROOM_STATE', (m) => m.room.seats[turn]?.connected === true);

    // Gone again: nothing before the delay, then a bot takes the seat and plays.
    let mark = watcher.messages.length;
    await back.close();
    await watcher.waitFor('ROOM_STATE', (m) => !m.room.seats[turn]?.connected, mark);
    mark = watcher.messages.length;
    clock.advance(29_999);
    await flush(watcher);
    expect(watcher.messages.slice(mark).some((m) => m.type === 'EVENT')).toBe(false);
    clock.advance(1);
    const botOn = await watcher.waitFor('ROOM_STATE', (m) => !!m.room.seats[turn]?.bot, mark);
    expect(botOn.room.seats[turn]?.connected).toBe(false);
    clock.advance(1_000);
    const played = await watcher.waitFor('EVENT', undefined, mark);
    expect(played.events[0]).toMatchObject({ type: 'CARD_PLAYED', player: turn, byTimeout: false });

    // The player returns and the bot stops.
    mark = watcher.messages.length;
    const again = await TestClient.connect(server.port, token);
    open.push(again);
    await watcher.waitFor('ROOM_STATE', (m) => m.room.seats[turn]?.bot === false, mark);
  });

  it('a player who used LEAVE can come back to the same seat with JOIN_ROOM', async () => {
    const t = await table('SOLO');
    const leaver = t.clients.P2;
    leaver.send({ type: 'LEAVE' });
    await flush(leaver);
    expect(server.game.room(t.code)?.seats.get('P2')?.left).toBe(true);
    const rejoined = await leaver.request(
      { type: 'JOIN_ROOM', code: t.code, role: 'PLAYER', playerName: 'P2' },
      'GAME_VIEW',
    );
    expect(rejoined.view.viewer).toBe('P2');
  });
});

describe('T-S-07 server clocks', () => {
  it('the turn timer plays for a silent player (rules.md §6.2)', async () => {
    const t = await table('SOLO');
    const view = (await t.host.waitFor('GAME_VIEW')).view;
    const watcher = t.clients[other(view.turn)];
    await watcher.waitFor('GAME_VIEW');
    const mark = watcher.messages.length;
    clock.advance(view.config.turnTimerMs - 1);
    await flush(watcher);
    expect(watcher.messages.slice(mark).some((m) => m.type === 'EVENT')).toBe(false);
    clock.advance(1);
    const first = await watcher.waitFor('EVENT', undefined, mark);
    expect(first.events[0]).toMatchObject({
      type: 'CARD_PLAYED',
      player: view.turn,
      byTimeout: true,
    });
    // The timer restarts for the next player.
    clock.advance(view.config.turnTimerMs);
    const second = await watcher.waitFor('EVENT', (m) => m.stateVersion > first.stateVersion);
    expect(second.events[0]).toMatchObject({ type: 'CARD_PLAYED', byTimeout: true });
  });

  it('a played card restarts the turn timer', async () => {
    const t = await table('SOLO');
    const view = (await t.host.waitFor('GAME_VIEW')).view;
    clock.advance(view.config.turnTimerMs - 1_000);
    const mover = t.clients[view.turn];
    const card = (await mover.waitFor('GAME_VIEW')).view.hands[view.turn]![0]!;
    const played = await mover.request({ type: 'PLAY_CARD', cardId: card.id }, 'EVENT');
    const mark = mover.messages.length;
    clock.advance(1_000);
    await flush(mover);
    expect(mover.messages.slice(mark).some((m) => m.type === 'EVENT')).toBe(false);
    clock.advance(view.config.turnTimerMs);
    const timeout = await mover.waitFor('EVENT', (m) => m.stateVersion > played.stateVersion);
    expect(timeout.events[0]).toMatchObject({ byTimeout: true });
  });

  it('the game clock fires TIME_UP and the game ends after that turn (rules.md §8)', async () => {
    const t = await table('SOLO', { timeLimitMs: 60_000, turnTimerMs: 300_000 });
    clock.advance(60_000);
    const up = await t.host.waitFor('EVENT', (m) => m.events.some((e) => e.type === 'TIME_UP'));
    const view = (await t.host.waitFor('GAME_VIEW', (m) => m.stateVersion >= up.stateVersion)).view;
    expect(view.timeUp).toBe(true);
    const mover = t.clients[view.turn];
    const card = (await mover.waitFor('GAME_VIEW', (m) => m.stateVersion >= up.stateVersion)).view
      .hands[view.turn]![0]!;
    const after = await mover.request({ type: 'PLAY_CARD', cardId: card.id }, 'GAME_VIEW');
    expect(after.view.phase).not.toBe('PLAYING');
  });
});

describe('T-S-09 rate limit', () => {
  it('throttles 50 chat messages in one second', async () => {
    const t = await table('TEAM');
    const sender = t.clients.P1;
    const mate = t.clients.P2;
    const mark = sender.messages.length;
    const mateMark = mate.messages.length;
    for (let i = 0; i < 50; i++) sender.send({ type: 'CHAT', text: `spam ${i}` });
    await flush(sender);
    const since = sender.messages.slice(mark);
    const limited = since.filter((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThanOrEqual(40);
    await flush(mate);
    const delivered = mate.messages.slice(mateMark).filter((m) => m.type === 'CHAT');
    expect(delivered.length).toBeLessThanOrEqual(5);
    expect(delivered.length).toBeGreaterThan(0);

    // The budget refills with time.
    clock.advance(10_000);
    const ok = await sender.request({ type: 'CHAT', text: 'later' }, 'CHAT');
    expect(ok.text).toBe('later');
  });
});
