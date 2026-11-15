import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { sideOf, type Card, type PlayerId, type Side } from '@qa/engine';
import { Board2D, type EdgeRef } from '../../components/board/board-2d';
import { CardBack, GateCard } from '../../components/cards/gate-card';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { en } from '../../i18n/en';
import { KET } from '../../lib/format';
import { buildLog } from '../../lib/game-log';
import { previewMove } from '../../lib/preview';
import { useNow } from '../../lib/use-now';
import { send } from '../../net/connection';
import { useGame, type GameViewData } from '../../state/store';
import { ActionLog } from './action-log';
import { Banner, Clocks, Scoreboard, TurnBar } from './hud';
import { GateReference, TeamPanel } from './side-panels';
import './game.css';

const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * The game is laid out on the 1920 × 1080 grid of ui-spec §7.1 and scaled to the window, so
 * every region keeps its place from 1920×1080 down to 1280×720.
 */
function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) || 1);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="stage-wrap">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** Time left on both clocks, counted down locally from the last GAME_VIEW. */
function useClocks(view: GameViewData | null) {
  const clocks = useGame((s) => s.clocks);
  const at = useGame((s) => s.clocksAt);
  const now = useNow();
  if (!clocks || !view) return { gameMs: 0, turnMs: null as number | null };
  const running = view.phase === 'PLAYING';
  const elapsed = running ? Math.max(0, now - at) : 0;
  return {
    gameMs: view.timeUp ? 0 : Math.max(0, clocks.gameMs - elapsed),
    turnMs: clocks.turnMs === null ? null : Math.max(0, clocks.turnMs - elapsed),
  };
}

/** ui-spec §7 game screen (2D board). */
export function GameScreen() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room);
  const view = useGame((s) => s.view);
  const logGameMs = useGame((s) => s.clocks?.logGameMs);
  const leftRoom = useGame((s) => s.leftRoom);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { gameMs, turnMs } = useClocks(view);

  const viewer = view?.viewer ?? 'SPECTATOR';
  const you: PlayerId | null = viewer === 'SPECTATOR' ? null : viewer;
  const mode = view?.config.mode ?? room?.mode ?? 'SOLO';
  const mySide: Side | null = you ? sideOf(mode, you) : null;
  const hand = useMemo<readonly Card[]>(() => (you && view?.hands[you]) || [], [you, view]);
  const selected = hand.find((c) => c.id === selectedId) ?? null;
  const myTurn = !!view && view.phase === 'PLAYING' && view.turn === you;
  const canPlay = myTurn && selected !== null;

  const rows = useMemo(
    () => (view ? buildLog(view.log, view.config.mode, logGameMs ?? []) : []),
    [view, logGameMs],
  );
  const preview = useMemo(
    () => (view && selected && mySide ? previewMove(view.qubits, selected.kind, mySide) : null),
    [view, selected, mySide],
  );
  const playable = useMemo<EdgeRef[]>(() => {
    if (!view || !mySide) return [];
    return hand.flatMap((c) => {
      const e = previewMove(view.qubits, c.kind, mySide).edge;
      return e ? [e] : [];
    });
  }, [view, hand, mySide]);

  const play = () => {
    if (!canPlay || !selected) return;
    send({ type: 'PLAY_CARD', cardId: selected.id });
    setSelectedId(null);
  };

  // ui-spec §7.3 keys: 1–4 select, Enter plays, Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= hand.length) {
        const id = hand[n - 1]!.id;
        setSelectedId((cur) => (cur === id ? null : id));
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (e.key === 'Enter' && canPlay) {
        e.preventDefault();
        play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const leave = () => {
    send({ type: 'LEAVE' });
    leftRoom();
    navigate('/lobby');
  };

  if (!view || !room) {
    return (
      <main className="screen" data-testid="game-screen">
        <p className="muted">{en.common.loading}</p>
      </main>
    );
  }

  const team = mode === 'TEAM';
  const orientation: Side = mySide ?? 'BLUE';
  const sides: Side[] = orientation === 'BLUE' ? ['BLUE', 'RED'] : ['RED', 'BLUE'];
  const caption = myTurn
    ? en.game.noPassing
    : you
      ? en.game.waitTurn(view.turn)
      : en.game.spectating;

  return (
    <main
      className={`game game--${team ? 'team' : 'solo'}${you ? '' : ' game--spectator'}`}
      data-testid="game-screen"
    >
      <Stage>
        <Scoreboard score={view.score} target={view.config.targetScore} />
        <div className="game-top">
          <TurnBar mode={mode} turn={view.turn} you={you} />
          <Banner rows={rows} logLength={view.log.length} />
        </div>
        <div className="game-actions">
          <Button variant="danger" size="small" onClick={() => setConfirmLeave(true)}>
            {en.game.leave}
          </Button>
          <button
            type="button"
            className="game-help"
            aria-label={en.game.help}
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        </div>
        <Clocks
          gameMs={gameMs}
          turnMs={view.phase === 'PLAYING' ? turnMs : null}
          turnTotalMs={view.config.turnTimerMs}
          deckCount={view.deckCount}
        />

        <div className="game-left">
          {sides.map((s) => (
            <TeamPanel key={s} side={s} mode={mode} room={room} view={view} you={you} />
          ))}
          <GateReference />
        </div>

        <div className="game-board">
          <Board2D
            ball={view.ball}
            orientation={orientation}
            playable={playable}
            preview={preview}
          />
          {view.phase === 'FINISHED' && view.winner && (
            <div className="game-over panel panel--gold">
              <span className="caption">{en.game.gameOver}</span>
              <strong>{en.banner.gameOver(view.winner)}</strong>
              <span className="ket">
                {view.score.BLUE} : {view.score.RED}
              </span>
              <Button size="small" onClick={leave}>
                {en.common.back}
              </Button>
            </div>
          )}
        </div>

        <div className="game-deck">
          <div className="game-deck__stack">
            <CardBack />
            <CardBack />
            <CardBack />
          </div>
          <span className="caption">{en.game.deck}</span>
          <span className="ket">{en.game.deckLeft(view.deckCount)}</span>
        </div>

        {you && (
          <div className="game-hand" role="group" aria-label="Hand">
            {hand.map((c, i) => {
              const isSel = c.id === selected?.id;
              return (
                <GateCard
                  key={c.id}
                  kind={c.kind}
                  selected={isSel}
                  previewLine={isSel ? preview?.line : null}
                  previewNote={isSel ? preview?.note : null}
                  onSelect={() => setSelectedId(isSel ? null : c.id)}
                  data-testid={`hand-card-${i}`}
                  data-gate={c.kind}
                />
              );
            })}
          </div>
        )}

        {you && (
          <div className="game-play">
            <Button data-testid="play-card" disabled={!canPlay} onClick={play}>
              {en.game.playCard}
            </Button>
            <span className="caption">{caption}</span>
            {preview && (
              <span className="game-play__preview ket" data-testid="preview-line">
                {preview.line}
                {preview.note ? ` · ${preview.note}` : ''}
              </span>
            )}
          </div>
        )}
        {!you && <p className="game-spectating caption">{en.game.spectating}</p>}

        <section className="game-state panel" aria-label={en.game.quantumState}>
          <h2 className="panel__title">{en.game.quantumState}</h2>
          <div className="game-state__kets">
            <div>
              <span className="caption">{en.game.football}</span>
              <span className={`ket game-state__ket${view.ball === 'FOG' ? ' is-fog' : ''}`}>
                {KET[view.ball]}
              </span>
            </div>
            <div>
              <span className="caption">{en.game.partner}</span>
              <span className={`ket game-state__ket${view.partner === 'FOG' ? ' is-fog' : ''}`}>
                {KET[view.partner]}
              </span>
            </div>
          </div>
          <p
            className={`game-state__fog ${view.ball === 'FOG' ? 'is-fog' : ''}`}
            data-testid="state-fog-indicator"
            data-fog={view.ball === 'FOG'}
          >
            {view.ball === 'FOG' ? en.game.entangled : en.game.notEntangled}
          </p>
          <p className="muted game-state__soon">{en.game.stateSoon}</p>
        </section>

        <ActionLog rows={rows} room={room} />

        {team && you && (
          <section className="game-chat panel" data-testid="team-chat">
            <h2 className="panel__title">{en.game.teamChat(mySide === 'BLUE' ? 'BLUE' : 'RED')}</h2>
            <p className="muted">{en.game.chatSoon}</p>
          </section>
        )}
      </Stage>

      <Modal open={help} title={en.game.gateReference}>
        <GateReference />
        <p className="caption">{en.game.keysHint}</p>
        <Button variant="secondary" size="small" onClick={() => setHelp(false)}>
          {en.common.back}
        </Button>
      </Modal>
      <Modal open={confirmLeave} title={en.game.leave}>
        <p>{en.game.leaveConfirm}</p>
        <div className="row">
          <Button variant="danger" onClick={leave}>
            {en.game.leave}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
            {en.game.stay}
          </Button>
        </div>
      </Modal>
    </main>
  );
}
