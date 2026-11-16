import { describe, expect, it } from 'vitest';
import { kickoffState, type BallPosition, type Card, type GameEvent } from '@qa/engine';
import { AnimationPlayer } from './player';
import { replayStates } from '../replay';

const play = (kind: Card['kind'], from: BallPosition, to: BallPosition): GameEvent => ({
  type: 'CARD_PLAYED',
  player: 'P1',
  card: { id: 1, kind },
  from,
  to,
  byTimeout: false,
});

const kick: GameEvent[] = [{ type: 'KICKOFF', ball: 'ZERO' }];
const moves: GameEvent[] = [
  ...kick,
  play('X', 'ZERO', 'ONE'),
  play('X', 'ONE', 'ZERO'),
  play('X', 'ZERO', 'ONE'),
  play('X', 'ONE', 'ZERO'),
  play('X', 'ZERO', 'ONE'),
];
const at = (log: GameEvent[]) => replayStates(log).at(-1)!;

describe('animation player (visual-design §4: a queue of animations from events)', () => {
  it('shows history as it is when the screen opens: no replay of old events', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    expect(p.busy(0)).toBe(false);
    expect(p.frame(0)).toMatchObject({ from: 'ZERO', to: 'ZERO', p: 1, lift: 0, visible: true });
  });

  it('a game that has just started plays its opening roll and kickoff', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    const start: GameEvent[] = [
      { type: 'OPENING_ROLL', blue: 6, red: 2 },
      { type: 'KICKOFF', ball: 'ZERO' },
    ];
    p.sync(start, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    expect(p.busy(0)).toBe(true);
    expect(p.frame(100).dice).toMatchObject({ blue: 6, red: 2 });
    expect(p.busy(5000)).toBe(false);
  });

  it('plays a new card over about 1 s, then rests where the server put the ball', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    const log = moves.slice(0, 2);
    p.sync(log, 'SOLO', 'ONE', at(log), 100);
    expect(p.busy(100)).toBe(true);
    expect(p.frame(600)).toMatchObject({ from: 'ZERO', to: 'ONE' });
    expect(p.frame(600).lift).toBeGreaterThan(0.9);
    expect(p.busy(1200)).toBe(false);
    expect(p.frame(1200)).toMatchObject({ from: 'ONE', to: 'ONE', lift: 0 });
    expect(p.frame(1200).bloch[2]).toBeCloseTo(-1);
  });

  it('plays queued steps one after another', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    const log = moves.slice(0, 3);
    p.sync(log, 'SOLO', 'ZERO', at(log), 0);
    expect(p.frame(500)).toMatchObject({ from: 'ZERO', to: 'ONE' });
    // The second step plays faster because another one was waiting.
    expect(p.frame(1300)).toMatchObject({ from: 'ONE', to: 'ZERO' });
    expect(p.busy(3000)).toBe(false);
  });

  it('never falls far behind: more than 3 waiting steps jump to the latest', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    p.sync(moves, 'SOLO', 'ONE', at(moves), 0);
    expect(p.pending()).toBeLessThanOrEqual(1);
    expect(p.busy(2000)).toBe(false);
    expect(p.frame(2000)).toMatchObject({ to: 'ONE' });
  });

  it('reduce motion: short moves', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: true });
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 0);
    const log = moves.slice(0, 2);
    p.sync(log, 'SOLO', 'ONE', at(log), 0);
    expect(p.busy(300)).toBe(false);
  });

  it('a new game (shorter log) resets without animating', () => {
    const p = new AnimationPlayer({ speed: 1, reduce: false });
    p.sync(moves, 'SOLO', 'ONE', at(moves), 0);
    p.sync(kick, 'SOLO', 'ZERO', kickoffState('ZERO'), 10);
    expect(p.busy(10)).toBe(false);
    expect(p.frame(10)).toMatchObject({ to: 'ZERO' });
  });
});
