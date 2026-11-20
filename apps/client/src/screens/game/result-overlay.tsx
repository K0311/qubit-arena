import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { sideOf, type PlayerId } from '@qa/engine';
import type { Room } from '@qa/protocol';
import { Button } from '../../components/ui/button';
import { en } from '../../i18n/en';
import { minutesSeconds } from '../../lib/format';
import { matchStats } from '../../lib/match-stats';
import { send } from '../../net/connection';
import { useGame, type GameViewData } from '../../state/store';

/** Shown only while the user study runs (ui-spec §10). */
const STUDY = import.meta.env.VITE_STUDY === '1';

/** ui-spec §10 Result overlay: winner, score, end reason, stats and the next step. */
export function ResultOverlay({ view, room }: { view: GameViewData; room: Room }) {
  const navigate = useNavigate();
  const leftRoom = useGame((s) => s.leftRoom);
  const logGameMs = useGame((s) => s.clocks?.logGameMs);
  const stats = useMemo(() => matchStats(view.log, logGameMs ?? []), [view.log, logGameMs]);
  const t = en.result;
  const winner = view.winner ?? 'DRAW';
  const you = view.viewer === 'SPECTATOR' ? null : view.viewer;
  const mySide = you ? sideOf(view.config.mode, you) : null;
  const verdict =
    winner === 'DRAW' ? t.draw : !mySide ? null : winner === mySide ? t.victory : t.defeat;
  const tone = winner === 'BLUE' ? 'blue' : winner === 'RED' ? 'red' : 'gold';

  // The pill says how the game ended; the line under it says why that decides the winner, so a
  // 0 : 0 win after a Quantum Challenge does not read as a mistake.
  const [reason, why] = ((): [string, string] => {
    switch (view.endReason) {
      case 'TARGET':
        return [t.reasonTarget(view.config.targetScore), t.whyTarget];
      case 'TIME':
        return [t.reasonTime, t.whyMore];
      case 'NO_CARDS':
        return [t.reasonCards, t.whyMore];
      case 'CHALLENGE':
      case 'DRAW':
        return stats.challenge
          ? [
              t.reasonChallenge(stats.challenge.BLUE, stats.challenge.RED),
              winner === 'DRAW' ? t.whyDraw : t.whyChallenge,
            ]
          : [t.reasonDraw, t.whyDraw];
      default:
        return ['', ''];
    }
  })();

  const mainMenu = () => {
    send({ type: 'LEAVE' });
    leftRoom();
    navigate('/');
  };
  const seats = (Object.keys(view.handCounts) as PlayerId[]).sort();

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.title}>
      <div className={`result panel panel--${tone === 'gold' ? 'gold' : tone}`}>
        <span className={`result__ball result__ball--${tone}`} aria-hidden="true">
          🏈
        </span>
        {verdict && <span className={`result__verdict result__verdict--${tone}`}>{verdict}</span>}
        <h2 className={`result__winner result__winner--${tone}`} data-testid="result-winner">
          {winner === 'DRAW' ? t.drawTitle : t.wins(winner)}
        </h2>
        <p className="result__score num" aria-label={`${view.score.BLUE} : ${view.score.RED}`}>
          <span className="result__blue">{view.score.BLUE}</span>
          <span className="result__colon">:</span>
          <span className="result__red">{view.score.RED}</span>
        </p>
        <span className="pill pill--gold result__reason" data-testid="result-reason">
          {reason}
        </span>
        {why && <p className="result__why muted">{why}</p>}

        <table className="result__table">
          <thead>
            <tr>
              <th>{t.player}</th>
              <th>{t.touchdowns}</th>
              <th>{t.cards}</th>
              <th>{t.measure}</th>
              <th>CNOT</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((p) => {
              const s = stats.players[p] ?? { touchdowns: 0, cards: 0, measures: 0, cnots: 0 };
              return (
                <tr key={p} className={`result__row--${sideOf(view.config.mode, p).toLowerCase()}`}>
                  <td>
                    <b>{p}</b> {room.seats[p]?.name}
                  </td>
                  <td>{s.touchdowns}</td>
                  <td>{s.cards}</td>
                  <td>{s.measures}</td>
                  <td>{s.cnots}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="result__summary">
          <div>
            <dt>{t.turns}</dt>
            <dd className="num">{stats.turns}</dd>
          </div>
          <div>
            <dt>{t.entanglements}</dt>
            <dd className="num">{stats.entanglements}</dd>
          </div>
          <div>
            <dt>{t.failedPunts}</dt>
            <dd className="num">{stats.failedPunts}</dd>
          </div>
          <div>
            <dt>{t.longestFog}</dt>
            <dd className="num">
              {stats.longestFogMs === null ? '—' : minutesSeconds(stats.longestFogMs)}
            </dd>
          </div>
        </dl>

        <div className="result__actions">
          {you && (
            <Button data-testid="result-play-again" onClick={() => send({ type: 'REMATCH' })}>
              {t.playAgain}
            </Button>
          )}
          <Button variant="secondary" onClick={mainMenu}>
            {t.mainMenu}
          </Button>
          {STUDY && you && (
            <Button variant="secondary" onClick={() => navigate('/study')}>
              {t.learningCheck}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
