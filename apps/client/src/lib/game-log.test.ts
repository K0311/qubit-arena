import { describe, expect, it } from 'vitest';
import {
  applyAction,
  botAction,
  createGame,
  defaultConfig,
  mulberry32,
  type BallPosition,
  type Card,
  type GameEvent,
} from '@qa/engine';
import { buildLog } from './game-log';

const card = (kind: Card['kind'], id = 1): Card => ({ id, kind });
const play = (
  kind: Card['kind'],
  from: BallPosition,
  to: BallPosition,
  player: 'P1' | 'P2' = 'P1',
  byTimeout = false,
): GameEvent => ({ type: 'CARD_PLAYED', player, card: card(kind), from, to, byTimeout });

describe('action log from engine events (ui-spec §7.5)', () => {
  it('rows for roll, kickoff, card, touchdown with clock times', () => {
    const log: GameEvent[] = [
      { type: 'OPENING_ROLL', blue: 5, red: 2 },
      { type: 'KICKOFF', ball: 'ZERO' },
      play('H', 'ZERO', 'PLUS'),
      { type: 'TOUCHDOWN', side: 'BLUE', player: 'P1' },
    ];
    const rows = buildLog(log, 'SOLO', [900_000, 900_000, 872_000, 872_000]);
    expect(rows.map((r) => [r.kind, r.time, r.text, r.result])).toEqual([
      ['roll', '15:00', 'Opening roll', 'Blue 5 · Red 2'],
      ['kickoff', '15:00', 'Kickoff', 'ball |0⟩, partner |+⟩'],
      ['card', '14:32', 'played', '|0⟩ → |+⟩'],
      ['touchdown', '14:32', 'TOUCHDOWN Blue +1', ''],
    ]);
    expect(rows[2]).toMatchObject({
      seat: 'P1',
      card: 'H',
      side: 'BLUE',
      banners: ['H:  |0⟩ → |+⟩'],
    });
    expect(rows[3]!.banners).toEqual(['TOUCHDOWN!  BLUE TEAM (P1)']);
  });

  it('measure, failed punt, timeout and the no-score banners', () => {
    const log: GameEvent[] = [
      { type: 'KICKOFF', ball: 'ONE' },
      play('MEASURE', 'ONE', 'ONE', 'P2', true),
      { type: 'MEASURED', outcome: 'ONE' },
      play('H', 'ONE', 'MINUS', 'P1'),
      play('S', 'MINUS', 'MINUS_I', 'P2'),
    ];
    const rows = buildLog(log, 'SOLO');
    expect(rows[1]).toMatchObject({
      result: 'failed punt',
      measured: true,
      timeout: true,
      time: null,
    });
    expect(rows[1]!.banners).toEqual(['MEASUREMENT', 'FAILED PUNT: stays at |1⟩']);
    expect(rows[2]!.banners).toEqual(['H:  |1⟩ → |−⟩', "NO SCORE — Red's endzone"]);
  });

  it('fog in and out, and phase kickback replayed from the log (rules.md §4.3–§4.4)', () => {
    const log: GameEvent[] = [
      { type: 'KICKOFF', ball: 'ZERO' },
      play('CNOT', 'ZERO', 'FOG'),
      play('X', 'FOG', 'FOG', 'P2'),
      play('CNOT', 'FOG', 'ONE'),
      play('H', 'ONE', 'MINUS', 'P2'),
      play('CNOT', 'MINUS', 'MINUS'),
    ];
    const results = buildLog(log, 'SOLO').map((r) => r.result);
    expect(results).toEqual([
      'ball |0⟩, partner |+⟩',
      '→ fog',
      'stays in fog',
      'fog → |1⟩',
      '|1⟩ → |−⟩',
      'partner → |−⟩',
    ]);
  });

  it('turns every event of a real bot game into rows without throwing', () => {
    for (const mode of ['SOLO', 'TEAM'] as const) {
      const rng = mulberry32(42);
      let state = createGame(defaultConfig(mode), rng).state;
      for (let n = 0; n < 200 && state.phase === 'PLAYING'; n++) {
        const action = botAction(state, state.turn, rng);
        if (!action) break;
        state = applyAction(state, action, rng).state;
      }
      const rows = buildLog(state.log, mode);
      const cardsPlayed = state.log.filter((e) => e.type === 'CARD_PLAYED').length;
      expect(rows.filter((r) => r.kind === 'card')).toHaveLength(cardsPlayed);
    }
  });
});
