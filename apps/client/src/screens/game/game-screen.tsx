import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { sideOf, type Card, type PlayerId, type Side } from '@qa/engine';
import { Board2D, type EdgeRef } from '../../components/board/board-2d';
import { CAMERA_VIEWS, hasWebGL } from '../../components/board3d/layout';
import '../../components/board3d/board-3d.css';
import { CardBack, GateCard } from '../../components/cards/gate-card';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { en } from '../../i18n/en';
import { buildLog } from '../../lib/game-log';
import { previewMove } from '../../lib/preview';
import { useNow } from '../../lib/use-now';
import { send } from '../../net/connection';
import { useSettings } from '../../state/settings';
import { useGame, type GameViewData } from '../../state/store';
import { ActionLog } from './action-log';
import { ChallengeOverlay, useChallengeReveal } from './challenge-overlay';
import { ResultOverlay } from './result-overlay';
import { useAnimationPlayer } from '../../lib/anim/use-animation';
import { AnimatedBoard2D, AnimatedStatePanel, CardFly, Dice } from './anim-hud';
import { TeamChat } from './team-chat';
import { Banner, Clocks, Scoreboard, TurnBar } from './hud';
import { GateReference, TeamPanel } from './side-panels';
import { FullscreenButton } from './fullscreen';
import './game.css';
import './overlays.css';

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

/** three.js loads only when a game opens (about 600 KB), so menus stay light. */
const Board3D = lazy(() => import('../../components/board3d/board-3d'));

/** ui-spec §7 game screen. */
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
  const reveal = useChallengeReveal(view);
  const settings = useSettings();
  const [webgl] = useState(hasWebGL);
  const use3D = settings.board === '3D' && webgl;
  const reduceMotion =
    settings.reduceMotion === 'on' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // visual-design §4: one queue turns new log entries into animations for every view of the board.
  const player = useAnimationPlayer(view, { speed: settings.speed, reduce: reduceMotion });

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

  const boardProps = {
    ball: view.ball,
    orientation,
    playable,
    preview,
    showLabels: settings.showLabels,
    ballShape: settings.ball,
    swirl: settings.swirl,
  };
  const board2d = <AnimatedBoard2D {...boardProps} player={player} view={view} />;

  return (
    <main
      className={`game game--${team ? 'team' : 'solo'}${you ? '' : ' game--spectator'}`}
      data-testid="game-screen"
    >
      {/* ui-spec §1: the stage is 16:9 and mobile is out of scope; upright, it is too small to play. */}
      <div className="rotate-hint" role="note">
        <span aria-hidden="true">⟳</span>
        {en.game.rotateHint}
      </div>
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
          <FullscreenButton />
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
          <GateReference focus={selected?.kind ?? null} />
        </div>

        <div className="game-board" data-board={use3D ? '3D' : '2D'}>
          {use3D ? (
            <>
              <Suspense fallback={board2d}>
                <Board3D
                  {...boardProps}
                  qubits={view.qubits}
                  camera={settings.camera}
                  active={sideOf(mode, view.turn)}
                  reduceMotion={reduceMotion}
                  player={player}
                />
              </Suspense>
              <div className="board-minimap" aria-label={en.settings.minimap}>
                <Board2D
                  ball={view.ball}
                  orientation={orientation}
                  showLabels={false}
                  swirl={0}
                  decorative
                />
              </div>
              <div className="board-cams" role="radiogroup" aria-label={en.settings.camera}>
                {CAMERA_VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={settings.camera === v}
                    className={settings.camera === v ? 'is-on' : ''}
                    onClick={() => settings.set({ camera: v })}
                    data-testid={`camera-${v.toLowerCase()}`}
                  >
                    {en.settings.cameras[v]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            board2d
          )}
          <Dice player={player} view={view} />
        </div>
        <CardFly view={view} you={you} speed={settings.speed} reduce={reduceMotion} sides={sides} />

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
            {/* A dim PLAY CARD looked broken; the disabled button says what it is waiting for. */}
            <Button
              data-testid="play-card"
              className={canPlay ? undefined : 'game-play__idle'}
              disabled={!canPlay}
              onClick={play}
            >
              {canPlay ? en.game.playCard : myTurn ? en.game.pickCard : en.game.notYourTurn}
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

        <AnimatedStatePanel player={player} view={view} />

        <ActionLog rows={rows} room={room} />

        {team && you && mySide && <TeamChat side={mySide} />}
      </Stage>

      {(view.phase === 'CHALLENGE' || reveal) && (
        <ChallengeOverlay view={view} room={room} reveal={reveal} />
      )}
      {view.phase === 'FINISHED' && !reveal && <ResultOverlay view={view} room={room} />}

      <Modal open={help} title={en.game.gateReference}>
        <GateReference full />
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
