import type { GameEvent, PlayerId, Side } from '@qa/engine';

export type PlayerStats = {
  touchdowns: number;
  cards: number;
  measures: number;
  cnots: number;
};

export type MatchStats = {
  players: Partial<Record<PlayerId, PlayerStats>>;
  turns: number;
  entanglements: number;
  failedPunts: number;
  /** Longest stretch with the ball in the fog, in ms of game clock (null without clock data). */
  longestFogMs: number | null;
  /** Quantum Challenge points per side, counted from the results. */
  challenge: Record<Side, number> | null;
};

/** Result screen stats (ui-spec §10), counted from the engine's event log only. */
export function matchStats(
  log: readonly GameEvent[],
  logGameMs: readonly number[] = [],
): MatchStats {
  const players: MatchStats['players'] = {};
  const of = (p: PlayerId) => (players[p] ??= { touchdowns: 0, cards: 0, measures: 0, cnots: 0 });
  let turns = 0;
  let entanglements = 0;
  let failedPunts = 0;
  let fogSince: number | null = null;
  let longest: number | null = null;
  let challenge: Record<Side, number> | null = null;
  const at = (i: number) => logGameMs[i];
  const closeFog = (i: number) => {
    const end = at(i);
    if (fogSince !== null && end !== undefined) longest = Math.max(longest ?? 0, fogSince - end);
    fogSince = null;
  };

  log.forEach((e, i) => {
    switch (e.type) {
      case 'CARD_PLAYED': {
        turns++;
        const s = of(e.player);
        s.cards++;
        if (e.card.kind === 'MEASURE') {
          s.measures++;
          if (e.from === e.to && e.from !== 'FOG') failedPunts++;
        }
        if (e.card.kind === 'CNOT') s.cnots++;
        if (e.to === 'FOG' && e.from !== 'FOG') {
          entanglements++;
          fogSince = at(i) ?? null;
        } else if (e.from === 'FOG' && e.to !== 'FOG') {
          closeFog(i);
        }
        return;
      }
      case 'TOUCHDOWN':
        of(e.player).touchdowns++;
        return;
      case 'KICKOFF':
      case 'GAME_OVER':
      case 'TIME_UP':
        // A new round or the end of play closes any open fog stretch.
        if (fogSince !== null) closeFog(i);
        return;
      case 'CHALLENGE_STARTED':
        challenge = { BLUE: 0, RED: 0 };
        return;
      case 'CHALLENGE_RESULT':
        challenge ??= { BLUE: 0, RED: 0 };
        if (e.correct.BLUE) challenge.BLUE++;
        if (e.correct.RED) challenge.RED++;
        return;
      default:
        return;
    }
  });
  return { players, turns, entanglements, failedPunts, longestFogMs: longest, challenge };
}
