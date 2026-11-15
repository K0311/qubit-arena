import {
  applyCnot,
  applySingleGate,
  END_ZONE,
  kickoffState,
  measureFootball,
  otherSide,
  partnerPosition,
  sideOf,
  type CardKind,
  type GameEvent,
  type Mode,
  type PlayerId,
  type Side,
  type SingleGate,
  type TwoQubitState,
} from '@qa/engine';
import { en } from '../i18n/en';
import { CARD_LABEL, KET, minutesSeconds } from './format';

export type LogRow = {
  /** Index of the event in view.log that starts this row. */
  readonly index: number;
  readonly kind: 'card' | 'touchdown' | 'kickoff' | 'roll' | 'info';
  readonly side: Side | null;
  /** Game clock remaining when it happened (ui-spec §7.5), if the server reported it. */
  readonly time: string | null;
  readonly seat: PlayerId | null;
  readonly card: CardKind | null;
  readonly measured: boolean;
  readonly timeout: boolean;
  /** Text without the seat and card (those are rendered with colour). */
  readonly text: string;
  readonly result: string;
  /** Centre-top banners for this row (visual-design §4), in the order they show. */
  readonly banners: readonly string[];
};

const L = en.log;
const B = en.banner;
const sideName = (s: Side) => (s === 'BLUE' ? 'Blue' : 'Red');

/** An Rng that always yields the outcome the server already reported (replay only). */
const forced = (outcome: 'ZERO' | 'ONE') => ({ next: () => (outcome === 'ZERO' ? 0 : 1 - 1e-12) });

/**
 * Action log rows and banners built only from engine events (ui-spec §7.5). The partner is not
 * in the events, so its position is replayed from the log with the engine: kickoff, every card
 * and every reported measurement outcome fully determine the two-qubit state.
 */
export function buildLog(log: readonly GameEvent[], mode: Mode, logGameMs: readonly number[] = []) {
  const rows: LogRow[] = [];
  let qubits: TwoQubitState | null = null;
  const time = (i: number) => (logGameMs[i] === undefined ? null : minutesSeconds(logGameMs[i]!));
  const row = (
    i: number,
    r: Omit<LogRow, 'index' | 'time' | 'seat' | 'card' | 'measured' | 'timeout'> & Partial<LogRow>,
  ) =>
    rows.push({
      seat: null,
      card: null,
      measured: false,
      timeout: false,
      ...r,
      index: i,
      time: time(i),
    });

  log.forEach((e, i) => {
    switch (e.type) {
      case 'OPENING_ROLL':
        row(i, {
          kind: 'roll',
          side: null,
          text: L.roll,
          result: L.rollResult(e.blue, e.red),
          banners: [B.roll(e.blue, e.red)],
        });
        return;
      case 'KICKOFF':
        qubits = kickoffState(e.ball);
        row(i, {
          kind: 'kickoff',
          side: e.side ?? null,
          text: L.kickoff,
          result: L.kickoffResult(KET[e.ball]!, KET[partnerPosition(qubits)]!),
          banners: [B.kickoff(e.side ?? null, KET[e.ball]!)],
        });
        return;
      case 'CARD_PLAYED': {
        const side = sideOf(mode, e.player);
        const kind = e.card.kind;
        const label = CARD_LABEL[kind];
        const before = qubits;
        const next = log[i + 1];
        const outcome = kind === 'MEASURE' && next?.type === 'MEASURED' ? next.outcome : null;
        if (qubits) {
          if (kind === 'MEASURE')
            qubits = outcome ? measureFootball(qubits, forced(outcome)).state : qubits;
          else if (kind === 'CNOT') qubits = applyCnot(qubits);
          else qubits = applySingleGate(qubits, kind as SingleGate);
        }
        const partnerMoved =
          before !== null && qubits !== null && partnerPosition(before) !== partnerPosition(qubits);
        const { from, to } = e;
        let result: string;
        let banner: string;
        if (kind === 'MEASURE') {
          const failed = from === to && from !== 'FOG';
          result = failed ? L.failedPunt : L.measure(KET[to]!);
          banner = failed ? B.failedPunt(KET[to]!) : B.result(KET[to]!);
        } else if (from === 'FOG' && to === 'FOG') {
          result = L.staysFog;
          banner = B.staysFog(label);
        } else if (to === 'FOG') {
          result = L.toFog;
          banner = B.cnotIn;
        } else if (from === 'FOG') {
          result = L.fromFog(KET[to]!);
          banner = B.cnotOut(KET[to]!);
        } else if (from === to && partnerMoved) {
          const p = KET[partnerPosition(qubits!)]!;
          result = L.partner(p);
          banner = B.kickback(p);
        } else if (from === to) {
          result = L.stays(KET[to]!);
          banner = kind === 'CNOT' ? B.cnotNothing : B.gate(label, KET[from]!, KET[to]!);
        } else {
          result = `${KET[from]} → ${KET[to]}`;
          banner = B.gate(label, KET[from]!, KET[to]!);
        }
        const banners = kind === 'MEASURE' ? [B.measuring, banner] : [banner];
        // Derived on the client (visual-design §4): moves into a zone that do not score.
        const other = END_ZONE[otherSide(side)];
        if (to === other && from !== other) banners.push(B.noScoreOther(sideName(otherSide(side))));
        if (to === END_ZONE[side] && from === END_ZONE[side]) banners.push(B.noScoreOwn);
        row(i, {
          kind: 'card',
          side,
          seat: e.player,
          card: kind,
          measured: kind === 'MEASURE',
          timeout: e.byTimeout,
          text: L.played,
          result,
          banners,
        });
        return;
      }
      case 'MEASURED':
        return; // shown on its card row
      case 'TOUCHDOWN':
        row(i, {
          kind: 'touchdown',
          side: e.side,
          seat: e.player,
          text: L.touchdown(sideName(e.side)),
          result: '',
          banners: [B.touchdown(e.side, e.player)],
        });
        return;
      case 'TIME_UP':
        row(i, { kind: 'info', side: null, text: L.timeUp, result: '', banners: [B.timeUp] });
        return;
      case 'CHALLENGE_STARTED':
        row(i, { kind: 'info', side: null, text: L.challenge, result: '', banners: [B.challenge] });
        return;
      case 'CHALLENGE_ANSWERED':
        row(i, {
          kind: 'info',
          side: e.side,
          text: L.answered(sideName(e.side)),
          result: '',
          banners: [],
        });
        return;
      case 'CHALLENGE_RESULT':
        row(i, {
          kind: 'info',
          side: null,
          text: L.question,
          result: `Blue ${e.correct.BLUE ? '✓' : '✗'} · Red ${e.correct.RED ? '✓' : '✗'}`,
          banners: [],
        });
        return;
      case 'GAME_OVER':
        row(i, {
          kind: 'info',
          side: e.winner === 'DRAW' ? null : e.winner,
          text: L.gameOver,
          result: B.gameOver(e.winner),
          banners: [B.gameOver(e.winner)],
        });
        return;
    }
  });
  return rows;
}
