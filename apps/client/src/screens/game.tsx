import { useNavigate } from 'react-router';
import { sideOf, type PlayerId } from '@qa/engine';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { PlayerChip } from '../components/ui/player-chip';
import { en } from '../i18n/en';
import { KET } from '../lib/format';
import { send } from '../net/connection';
import { useGame } from '../state/store';

/**
 * Temporary game screen: shows the live state from the server so P-4.1 can be checked end to
 * end. P-4.2 replaces it with the board, hand and preview (ui-spec §7).
 */
export function GameScreen() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room);
  const view = useGame((s) => s.view);
  const leftRoom = useGame((s) => s.leftRoom);
  const leave = () => {
    send({ type: 'LEAVE' });
    leftRoom();
    navigate('/lobby');
  };
  return (
    <main className="screen" data-testid="game-screen">
      <header className="screen__header">
        <h1>
          {en.game.title} {room ? `· ${room.name}` : ''}
        </h1>
        <Button variant="danger" size="small" onClick={leave}>
          {en.room.leave}
        </Button>
      </header>
      {view && room ? (
        <Panel>
          <p className="muted">{en.game.placeholder}</p>
          <div className="row wrap">
            {(Object.keys(view.handCounts) as PlayerId[]).sort().map((p) => (
              <PlayerChip
                key={p}
                seat={p}
                side={sideOf(room.mode, p)}
                name={room.seats[p]?.name ?? p}
                cardCount={view.handCounts[p]}
                active={view.turn === p}
                you={view.viewer === p}
              />
            ))}
          </div>
          <p>
            {en.game.ball}: <span className="ket">{KET[view.ball]}</span> · {en.game.score}:{' '}
            <span data-testid="score-blue">{view.score.BLUE}</span> –{' '}
            <span data-testid="score-red">{view.score.RED}</span> · {en.game.turn}:{' '}
            <span data-testid="turn-active">{view.turn}</span>
          </p>
        </Panel>
      ) : (
        <p className="muted">{en.common.loading}</p>
      )}
    </main>
  );
}
