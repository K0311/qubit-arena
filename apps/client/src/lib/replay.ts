import {
  applyCnot,
  applySingleGate,
  kickoffState,
  measureFootball,
  type GameEvent,
  type SingleGate,
  type TwoQubitState,
} from '@qa/engine';

/** An Rng that always yields the outcome the server already reported (replay only). */
const forced = (outcome: 'ZERO' | 'ONE') => ({ next: () => (outcome === 'ZERO' ? 0 : 1 - 1e-12) });

/**
 * The two-qubit state after each event of the log, replayed with the engine (null before the
 * first kickoff). Events do not carry the partner, but kickoffs, cards and the reported
 * measurement outcomes determine the whole state, so the client can rebuild it exactly.
 */
export function replayStates(log: readonly GameEvent[]): (TwoQubitState | null)[] {
  const out: (TwoQubitState | null)[] = [];
  let q: TwoQubitState | null = null;
  log.forEach((e, i) => {
    if (e.type === 'KICKOFF') q = kickoffState(e.ball);
    else if (e.type === 'CARD_PLAYED' && q) {
      const kind = e.card.kind;
      if (kind === 'MEASURE') {
        const next = log[i + 1];
        if (next?.type === 'MEASURED') q = measureFootball(q, forced(next.outcome)).state;
      } else if (kind === 'CNOT') q = applyCnot(q);
      else q = applySingleGate(q, kind as SingleGate);
    }
    out.push(q);
  });
  return out;
}
