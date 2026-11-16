import { describe, expect, it } from 'vitest';
import { botAction, mulberry32, productState, type Mode } from '@qa/engine';
import { BOT_THINK_MS, GameServer } from '../src/game-server';
import { ManualScheduler } from '../src/scheduler';
import { MemClient, NO_LIMITS } from './mem-client';

function setup(mode: Mode = 'SOLO') {
  const clock = new ManualScheduler();
  const server = new GameServer({ scheduler: clock, limits: NO_LIMITS, botThinkMs: 1_000 });
  const host = new MemClient(server);
  host.say({ type: 'CREATE_ROOM', mode, visibility: 'PRIVATE', name: 'R', playerName: 'Ann' });
  const code = host.latest('ROOM_STATE').room.code;
  return { clock, server, host, code, room: () => server.room(code)! };
}

/** The human plays a random legal card whenever it is their turn; bots play the rest. */
function playOut(server: GameServer, clock: ManualScheduler, human: MemClient, code: string) {
  const rng = mulberry32(3);
  for (let step = 0; step < 5_000; step++) {
    const state = server.room(code)?.state;
    if (!state || state.phase === 'FINISHED') return;
    const me = server.room(code)!.seatOf(human.session);
    if (me) {
      const action = botAction(state, me, rng);
      if (action?.type === 'PLAY_CARD') human.say({ type: 'PLAY_CARD', cardId: action.cardId });
      if (action?.type === 'CHALLENGE_ANSWER') {
        human.say({
          type: 'CHALLENGE_ANSWER',
          questionId: action.questionId,
          choice: action.choice,
        });
      }
    }
    clock.advance(1_000);
  }
}

describe('T-S-11 Bot Arena: bots added on purpose', () => {
  it('the host adds a ready bot to the first free seat, or to the seat asked for', () => {
    const { host, room } = setup('TEAM');
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'ADD_BOT', seat: 'P4' });
    const seats = host.latest('ROOM_STATE').room.seats;
    expect(seats.P2).toMatchObject({ bot: true, ready: true, host: false });
    expect(seats.P2?.name).toMatch(/bot/i);
    expect(seats.P3).toBeNull();
    expect(seats.P4).toMatchObject({ bot: true, ready: true });
    expect(room().members()).toHaveLength(1);
  });

  it('only the host may add or remove bots, and only before the game', () => {
    const { server, host, code, room } = setup();
    const guest = new MemClient(server);
    guest.say({ type: 'JOIN_ROOM', code, role: 'SPECTATOR', playerName: 'Bo' });
    guest.say({ type: 'ADD_BOT' });
    expect(guest.latest('ERROR').code).toBe('NOT_HOST');
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'ADD_BOT' });
    expect(host.latest('ERROR').code).toBe('ROOM_FULL');
    guest.say({ type: 'REMOVE_BOT', seat: 'P2' });
    expect(guest.latest('ERROR').code).toBe('NOT_HOST');
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    expect(room().status).toBe('PLAYING');
    host.say({ type: 'REMOVE_BOT', seat: 'P2' });
    expect(host.latest('ERROR').code).toBe('GAME_IN_PROGRESS');
  });

  it('REMOVE_BOT frees the seat; it never removes a human', () => {
    const { server, host, code } = setup('TEAM');
    const guest = new MemClient(server);
    guest.say({ type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: 'Bo' });
    host.say({ type: 'ADD_BOT', seat: 'P3' });
    host.say({ type: 'REMOVE_BOT', seat: 'P2' });
    expect(host.latest('ERROR').code).toBe('BAD_MESSAGE');
    host.say({ type: 'REMOVE_BOT', seat: 'P3' });
    const seats = host.latest('ROOM_STATE').room.seats;
    expect(seats.P2?.name).toBe('Bo');
    expect(seats.P3).toBeNull();
  });

  it('a human joining by code takes a free seat, never a bot seat', () => {
    const { server, host, code } = setup('TEAM');
    host.say({ type: 'ADD_BOT', seat: 'P2' });
    const guest = new MemClient(server);
    guest.say({ type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: 'Bo' });
    expect(guest.latest('ROOM_STATE').you.seat).toBe('P3');
  });

  it('by default a bot waits 2.5 s before it plays, so the last move has finished animating', () => {
    expect(BOT_THINK_MS).toBe(2_500);
    const clock = new ManualScheduler();
    const server = new GameServer({ scheduler: clock, limits: NO_LIMITS });
    const me = new MemClient(server);
    me.say({ type: 'BOT_GAME', mode: 'SOLO', playerName: 'Ann' });
    const room = server.room(me.latest('ROOM_STATE').room.code)!;
    // Hand the turn to the bot (P2) and arm it as any change would.
    room.state = { ...room.state!, turn: 'P2' };
    (server as unknown as { scheduleBot(room: unknown): void }).scheduleBot(room);
    const cards = () => room.state!.log.filter((e) => e.type === 'CARD_PLAYED').length;
    const before = cards();
    clock.advance(BOT_THINK_MS - 1);
    expect(cards()).toBe(before);
    clock.advance(1);
    expect(cards()).toBe(before + 1);
  });

  it('a bot plays its own turns and the game finishes', () => {
    const { server, clock, host, code, room } = setup();
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    playOut(server, clock, host, code);
    expect(room().status).toBe('FINISHED');
    const log = host.latest('GAME_VIEW').view.log;
    expect(log.some((e) => e.type === 'CARD_PLAYED' && e.player === 'P2' && !e.byTimeout)).toBe(
      true,
    );
  });

  it('Play Again keeps the bots, ready; the human readies and the host starts', () => {
    const { server, clock, host, code, room } = setup();
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    playOut(server, clock, host, code);
    host.say({ type: 'REMATCH' });
    const seats = host.latest('ROOM_STATE').room.seats;
    expect(seats.P1).toMatchObject({ ready: false });
    expect(seats.P2).toMatchObject({ bot: true, ready: true });
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    expect(room().status).toBe('PLAYING');
  });

  it('the room closes when its only human leaves a bot game', () => {
    const { server, host, code } = setup();
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    host.say({ type: 'LEAVE' });
    expect(server.room(code)).toBeUndefined();
  });

  it('P-6.4: rooms start at EASY; the host switches the bot level before the game', () => {
    const { server, host, code, room } = setup();
    expect(host.latest('ROOM_STATE').room.botLevel).toBe('EASY');
    const guest = new MemClient(server);
    guest.say({ type: 'JOIN_ROOM', code, role: 'SPECTATOR', playerName: 'Bo' });
    guest.say({ type: 'UPDATE_SETTINGS', settings: { botLevel: 'NORMAL' } });
    expect(guest.latest('ERROR').code).toBe('NOT_HOST');
    host.say({ type: 'UPDATE_SETTINGS', settings: { botLevel: 'NORMAL' } });
    expect(host.latest('ROOM_STATE').room.botLevel).toBe('NORMAL');
    expect(room().botLevel).toBe('NORMAL');
    // The game config itself is unchanged: the level is a room setting, not a rule.
    expect(host.latest('ROOM_STATE').room.settings).not.toHaveProperty('botLevel');
  });

  it('P-6.4: a NORMAL bot takes the touchdown its hand offers', () => {
    const { server, clock, host, room } = setup();
    host.say({ type: 'UPDATE_SETTINGS', settings: { botLevel: 'NORMAL' } });
    host.say({ type: 'ADD_BOT' });
    host.say({ type: 'READY', ready: true });
    host.say({ type: 'START_GAME' });
    const r = room();
    // Red's bot (P2) to move with the ball at |1⟩: of I, H, S only H reaches |−⟩ (Red's zone).
    r.state = {
      ...r.state!,
      phase: 'PLAYING',
      turn: 'P2',
      qubits: productState('PLUS', 'ONE'),
      hands: {
        ...r.state!.hands,
        P2: [
          { id: 9001, kind: 'I' },
          { id: 9002, kind: 'H' },
          { id: 9003, kind: 'S' },
          { id: 9004, kind: 'I' },
        ],
      },
    };
    // The state was swapped behind the server's back; arm the bot as any change would.
    (server as unknown as { scheduleBot(room: unknown): void }).scheduleBot(r);
    clock.advance(1_000);
    const played = [...r.state!.log].reverse().find((e) => e.type === 'CARD_PLAYED');
    expect(played).toMatchObject({ player: 'P2', card: { kind: 'H' } });
    expect(r.state!.score.RED).toBe(1);
  });

  it.each(['SOLO', 'TEAM'] as const)(
    'BOT_GAME (%s) opens a private room, fills it with bots and starts at once',
    (mode) => {
      const clock = new ManualScheduler();
      const server = new GameServer({ scheduler: clock, limits: NO_LIMITS });
      const me = new MemClient(server);
      me.say({ type: 'BOT_GAME', mode, playerName: 'Ann' });
      const { room, you } = me.latest('ROOM_STATE');
      expect(room.status).toBe('PLAYING');
      expect(room.visibility).toBe('PRIVATE');
      expect(room.mode).toBe(mode);
      expect(you).toEqual({ seat: 'P1', host: true });
      const others = Object.entries(room.seats).filter(([p]) => p !== 'P1');
      expect(others).toHaveLength(mode === 'SOLO' ? 1 : 3);
      for (const [, seat] of others) expect(seat).toMatchObject({ bot: true });
      expect(me.latest('GAME_VIEW').view.viewer).toBe('P1');
    },
  );
});
