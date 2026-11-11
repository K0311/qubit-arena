import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '@qa/engine';
import { closeAll, startTable, TestClient, withServer, type Table } from './helpers';
import type { RunningServer } from '../src/server';

let server: RunningServer;
const open: TestClient[] = [];

async function setup(): Promise<number> {
  server = await withServer();
  return server.port;
}

async function table(mode: 'SOLO' | 'TEAM'): Promise<Table> {
  const t = await startTable(server.port, mode);
  open.push(...Object.values(t.clients));
  return t;
}

async function client(): Promise<TestClient> {
  const c = await TestClient.connect(server.port);
  open.push(c);
  return c;
}

afterEach(async () => {
  await closeAll(open.splice(0));
  await server?.close();
});

/** Latest GAME_VIEW every client has at stateVersion ≥ v. */
async function viewsAt(t: Table, v: number) {
  return Promise.all(
    Object.values(t.clients).map((c) =>
      c.waitFor('GAME_VIEW', (m) => m.stateVersion >= v).then(() => c.latest('GAME_VIEW')!),
    ),
  );
}

describe('T-S-01 create, join and start', () => {
  it.each(['SOLO', 'TEAM'] as const)(
    '%s: every client receives its own GAME_VIEW',
    async (mode) => {
      await setup();
      const t = await table(mode);
      const seats = Object.keys(t.clients) as PlayerId[];
      expect(seats).toHaveLength(mode === 'SOLO' ? 2 : 4);
      for (const seat of seats) {
        const view = await t.clients[seat].waitFor('GAME_VIEW');
        expect(view.view.viewer).toBe(seat);
        expect(view.view.phase).toBe('PLAYING');
        expect(view.view.hands[seat]).toHaveLength(4);
        const room = t.clients[seat].latest('ROOM_STATE')!;
        expect(room.room.status).toBe('PLAYING');
      }
    },
  );

  it('a private room is found by its code only; a full room says ROOM_FULL', async () => {
    await setup();
    const t = await table('SOLO');
    const late = await client();
    const full = await late.request(
      { type: 'JOIN_ROOM', code: t.code, role: 'PLAYER', playerName: 'Late' },
      'ERROR',
    );
    expect(full.code).toBe('GAME_IN_PROGRESS');
    const missing = await late.request(
      { type: 'JOIN_ROOM', code: 'ZZZ-99', role: 'PLAYER', playerName: 'Late' },
      'ERROR',
    );
    expect(missing.code).toBe('ROOM_NOT_FOUND');
  });

  it('only the host starts, and only when every seat is filled and ready', async () => {
    await setup();
    const host = await client();
    const created = await host.request(
      { type: 'CREATE_ROOM', mode: 'SOLO', visibility: 'PUBLIC', name: 'R', playerName: 'A' },
      'ROOM_STATE',
    );
    expect(created.you).toEqual({ seat: 'P1', host: true });
    expect((await host.request({ type: 'START_GAME' }, 'ERROR')).code).toBe('NOT_ALL_READY');
    const guest = await client();
    await guest.request(
      { type: 'JOIN_ROOM', code: created.room.code, role: 'PLAYER', playerName: 'B' },
      'ROOM_STATE',
    );
    expect((await guest.request({ type: 'START_GAME' }, 'ERROR')).code).toBe('NOT_HOST');
    await host.request({ type: 'READY', ready: true }, 'ROOM_STATE');
    await guest.request({ type: 'READY', ready: true }, 'ROOM_STATE');
    const view = await host.request({ type: 'START_GAME' }, 'GAME_VIEW');
    expect(view.view.phase).toBe('PLAYING');
  });

  it('quick match pairs two players and starts the game', async () => {
    await setup();
    const a = await client();
    const b = await client();
    await a.request({ type: 'QUICK_MATCH', mode: 'SOLO', playerName: 'A' }, 'ROOM_STATE');
    b.send({ type: 'QUICK_MATCH', mode: 'SOLO', playerName: 'B' });
    const [va, vb] = await Promise.all([a.waitFor('GAME_VIEW'), b.waitFor('GAME_VIEW')]);
    expect(new Set([va.view.viewer, vb.view.viewer])).toEqual(new Set(['P1', 'P2']));
  });

  it('players can switch to a free seat before the game', async () => {
    await setup();
    const host = await client();
    await host.request(
      { type: 'CREATE_ROOM', mode: 'TEAM', visibility: 'PUBLIC', name: 'R', playerName: 'A' },
      'ROOM_STATE',
    );
    const moved = await host.request({ type: 'TAKE_SEAT', seat: 'P3' }, 'ROOM_STATE');
    expect(moved.you.seat).toBe('P3');
    expect(moved.room.seats.P1).toBeNull();
    expect(moved.room.seats.P3?.host).toBe(true);
  });
});

describe('T-S-02 every client agrees after each move', () => {
  it.each(['SOLO', 'TEAM'] as const)('%s', async (mode) => {
    await setup();
    const t = await table(mode);
    let v = t.host.latest('GAME_VIEW')!.stateVersion;
    for (let move = 0; move < 40; move++) {
      const views = await viewsAt(t, v);
      const first = views[0]!.view;
      for (const { view } of views) {
        expect(view.ball).toBe(first.ball);
        expect(view.partner).toBe(first.partner);
        expect(view.score).toEqual(first.score);
        expect(view.turn).toBe(first.turn);
        expect(view.qubits).toEqual(first.qubits);
        expect(view.version).toBe(first.version);
      }
      if (first.phase !== 'PLAYING') break;
      const mover = t.clients[first.turn];
      const card = views.find((m) => m.view.viewer === first.turn)!.view.hands[first.turn]![0]!;
      const event = await mover.request({ type: 'PLAY_CARD', cardId: card.id }, 'EVENT');
      expect(event.events[0]).toMatchObject({ type: 'CARD_PLAYED', player: first.turn });
      v = event.stateVersion;
    }
  });
});

describe('T-S-03 hidden data (basic; full audit in P-3.4)', () => {
  it('a player sees its own hand and its teammate’s, only counts for opponents', async () => {
    await setup();
    const t = await table('TEAM');
    const view = (await t.clients.P1.waitFor('GAME_VIEW')).view;
    expect(Object.keys(view.hands).sort()).toEqual(['P1', 'P2']);
    expect(Object.keys(view.handCounts).sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(view).not.toHaveProperty('deck');
  });
});

describe('T-S-04 team chat', () => {
  it('reaches only the sender’s team', async () => {
    await setup();
    const t = await table('TEAM');
    const spectator = await client();
    await spectator.request(
      { type: 'JOIN_ROOM', code: t.code, role: 'SPECTATOR', playerName: 'S' },
      'GAME_VIEW',
    );
    const marks = Object.fromEntries(
      Object.entries(t.clients).map(([p, c]) => [p, c.messages.length]),
    );
    const specMark = spectator.messages.length;
    t.clients.P1.send({ type: 'CHAT', text: 'go for |+>' });
    const got = await t.clients.P2.waitFor('CHAT', undefined, marks.P2);
    expect(got).toMatchObject({ from: 'P1', name: 'P1', text: 'go for |+>' });
    await t.clients.P1.waitFor('CHAT', undefined, marks.P1);
    // A later message to everyone proves the red side and the spectator saw nothing before it.
    await t.clients.P3.request({ type: 'PING', t: 1 }, 'PONG');
    await t.clients.P4.request({ type: 'PING', t: 1 }, 'PONG');
    await spectator.request({ type: 'PING', t: 1 }, 'PONG');
    expect(t.clients.P3.messages.slice(marks.P3).some((m) => m.type === 'CHAT')).toBe(false);
    expect(t.clients.P4.messages.slice(marks.P4).some((m) => m.type === 'CHAT')).toBe(false);
    expect(spectator.messages.slice(specMark).some((m) => m.type === 'CHAT')).toBe(false);
    expect((await spectator.request({ type: 'CHAT', text: 'hi' }, 'ERROR')).code).toBe(
      'NOT_SEATED',
    );
  });
});

describe('T-S-05 bad messages', () => {
  it('out-of-turn and malformed messages return ERROR and change nothing', async () => {
    await setup();
    const t = await table('SOLO');
    const before = t.host.latest('GAME_VIEW')!;
    const turn = before.view.turn;
    const idle = t.clients[turn === 'P1' ? 'P2' : 'P1'];
    const idleView = (await idle.waitFor('GAME_VIEW')).view;
    const idleCard = idleView.hands[idleView.viewer as PlayerId]![0]!;

    const errors = [
      await idle.request({ type: 'PLAY_CARD', cardId: idleCard.id }, 'ERROR'),
      await t.clients[turn].request({ type: 'PLAY_CARD', cardId: 9999 }, 'ERROR'),
    ];
    const mark = idle.messages.length;
    idle.sendRaw('{not json');
    errors.push(await idle.waitFor('ERROR', undefined, mark));
    errors.push(
      await idle.request({ type: 'PLAY_CARD', cardId: 1, player: turn } as never, 'ERROR'),
    );
    errors.push(
      await idle.request({ type: 'CHALLENGE_ANSWER', questionId: 'x', choice: 0 }, 'ERROR'),
    );
    expect(errors.map((e) => e.code)).toEqual([
      'NOT_YOUR_TURN',
      'CARD_NOT_IN_HAND',
      'BAD_MESSAGE',
      'BAD_MESSAGE',
      'WRONG_PHASE',
    ]);

    // Nobody got a new view: the state did not move.
    await t.host.request({ type: 'PING', t: 2 }, 'PONG');
    expect(t.host.latest('GAME_VIEW')).toEqual(before);
    expect(server.game.room(t.code)?.state?.version).toBe(before.view.version);
  });
});

describe('T-S-08 spectators', () => {
  it('get public state only and cannot play', async () => {
    await setup();
    const t = await table('TEAM');
    const s = await client();
    const view = await s.request(
      { type: 'JOIN_ROOM', code: t.code, role: 'SPECTATOR', playerName: 'S' },
      'GAME_VIEW',
    );
    expect(view.view.viewer).toBe('SPECTATOR');
    expect(view.view.hands).toEqual({});
    expect(Object.keys(view.view.handCounts)).toHaveLength(4);
    expect(s.latest('ROOM_STATE')!.you.seat).toBe('SPECTATOR');
    expect((await s.request({ type: 'PLAY_CARD', cardId: 1 }, 'ERROR')).code).toBe('NOT_SEATED');

    // Spectators keep receiving public views as the game moves.
    const turn = view.view.turn;
    const card = t.clients[turn].latest('GAME_VIEW')!.view.hands[turn]![0]!;
    const mark = s.messages.length;
    t.clients[turn].send({ type: 'PLAY_CARD', cardId: card.id });
    const next = await s.waitFor('GAME_VIEW', undefined, mark);
    expect(next.view.hands).toEqual({});
  });
});
