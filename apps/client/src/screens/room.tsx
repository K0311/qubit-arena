import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { END_ZONE, sideOf, TURN_ORDER, type PlayerId, type Side } from '@qa/engine';
import type { Room } from '@qa/protocol';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { Pill } from '../components/ui/pill';
import { en } from '../i18n/en';
import { KET } from '../lib/format';
import { send } from '../net/connection';
import { usePlayerName } from '../state/player-name';
import { useGame } from '../state/store';
import { stateColors } from '../theme/state-colors';
import { MatchSettings } from './match-settings';

type Seat = NonNullable<Room['seats'][PlayerId]>;

/** A dome character in the team colour, like the ones on the board (visual-design §2). */
function Dome({ seat, side, open = false }: { seat: PlayerId; side: Side; open?: boolean }) {
  return (
    <span
      className={`seat-dome ${open ? 'seat-dome--open' : `seat-dome--${side.toLowerCase()}`}`}
      aria-hidden="true"
    >
      <span className="ket">{seat}</span>
    </span>
  );
}

function SeatCard({
  p,
  side,
  seat,
  you,
  host,
  botLevel,
}: {
  p: PlayerId;
  side: Side;
  seat: Seat;
  you: boolean;
  host: boolean;
  botLevel: Room['botLevel'];
}) {
  // Tags stay lowercase words in the DOM (shown in caps by CSS): tests and the e2e helpers
  // find "you" and "bot" in this element.
  const tags = [
    you ? en.room.you : null,
    seat.host ? en.room.host : null,
    seat.bot ? `${en.room.bot} · ${en.botLevel[botLevel]}` : null,
    !seat.connected && !seat.bot ? en.room.away : null,
  ].filter((t): t is string => !!t);
  return (
    <div
      className={[
        'seat-card',
        you ? 'seat-card--you' : '',
        seat.connected || seat.bot ? '' : 'seat-card--away',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`seat-${p}`}
      data-ready={seat.ready}
    >
      <div className="seat-card__status">
        {host && seat.bot && (
          <Button
            variant="secondary"
            size="small"
            className="seat-card__remove"
            data-testid={`seat-${p}-remove-bot`}
            aria-label={en.room.removeBot(p)}
            title={en.room.removeBot(p)}
            onClick={() => send({ type: 'REMOVE_BOT', seat: p })}
          >
            ✕
          </Button>
        )}
        <span className={`caption ${seat.ready ? 'seat-card__ready' : ''}`}>
          {seat.ready ? en.room.ready : en.room.notReady}
        </span>
        <span className={seat.ready ? 'seat-card__check' : 'seat-card__wait'} aria-hidden="true">
          {seat.ready ? '✓' : ''}
        </span>
      </div>
      <div
        className="seat-card__who"
        data-testid={`player-chip-${p}`}
        aria-label={`${side} ${p} ${seat.name}`}
      >
        <Dome seat={p} side={side} />
        <span className="seat-card__name">{seat.name}</span>
        <span className="seat-card__tags">
          {(tags.length > 0 ? tags : [en.room.player]).map((t) => (
            <span key={t} className={`tag ${t === en.room.you ? 'tag--you' : ''}`}>
              {t}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function OpenSeat({ p, side, host }: { p: PlayerId; side: Side; host: boolean }) {
  return (
    <div className="seat-card seat-card--open" data-testid={`seat-${p}`}>
      <Dome seat={p} side={side} open />
      <span className="seat-card__name seat-card__name--open">{en.room.openSeat}</span>
      <span className="muted">{host ? en.room.openSeatHint : en.room.openSeatHintGuest}</span>
      <div className="row">
        <Button
          variant="secondary"
          size="small"
          data-testid={`seat-${p}-take`}
          title={en.room.takeSeat}
          onClick={() => send({ type: 'TAKE_SEAT', seat: p })}
        >
          {en.room.takeSeat}
        </Button>
        {host && (
          <Button
            variant="secondary"
            size="small"
            data-testid={`seat-${p}-add-bot`}
            title={en.room.addBotTitle(p)}
            onClick={() => send({ type: 'ADD_BOT', seat: p })}
          >
            {en.room.addBot}
          </Button>
        )}
      </div>
    </div>
  );
}

function TeamColumn({ side }: { side: Side }) {
  const room = useGame((s) => s.room);
  const you = useGame((s) => s.you);
  if (!room) return null;
  // Only the host adds or removes bots, and only while the room waits (Bot Arena).
  const host = !!you?.host && room.status === 'WAITING';
  const seats = (Object.keys(room.seats) as PlayerId[])
    .sort()
    .filter((p) => sideOf(room.mode, p) === side);
  const lower = side.toLowerCase();
  return (
    <Panel
      className={`team-col team-col--${lower}`}
      accent={side === 'BLUE' ? 'blue' : 'red'}
      data-testid={`team-${lower}`}
    >
      <div className="team-col__head">
        <h2 className={`team-col__title team-col__title--${lower}`}>
          {side === 'BLUE' ? en.room.blueTeam : en.room.redTeam}
        </h2>
        <span className="team-col__zone">
          <span
            className="zone-dot"
            style={{ background: stateColors[END_ZONE[side]] }}
            aria-hidden="true"
          />
          <span className="muted">{en.room.blueZone}</span>
          <span className="ket">{KET[END_ZONE[side]]}</span>
        </span>
      </div>
      <div className="team-col__seats">
        {seats.map((p) => {
          const seat = room.seats[p];
          return seat ? (
            <SeatCard
              key={p}
              p={p}
              side={side}
              seat={seat}
              you={you?.seat === p}
              host={host}
              botLevel={room.botLevel}
            />
          ) : (
            <OpenSeat key={p} p={p} side={side} host={host} />
          );
        })}
      </div>
    </Panel>
  );
}

/** The middle of the stage: VS and the turn order of rules.md §6, read from the engine. */
function Versus({ room }: { room: Room }) {
  return (
    <div className="versus">
      <div className="versus__ring">{en.room.vs}</div>
      <span className="caption">{en.room.turnOrder}</span>
      <ol className="versus__order" data-testid="room-turn-order">
        {TURN_ORDER[room.mode].map((p) => (
          <li
            key={p}
            data-seat={p}
            className={`turn-chip turn-chip--${sideOf(room.mode, p).toLowerCase()}`}
          >
            {p}
          </li>
        ))}
      </ol>
      <span className="versus__note muted">{en.room.openingRoll}</span>
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="room-code">
      <span data-testid="room-code">
        <span className="caption">{en.room.code}</span> <span className="ket">{code}</span>
      </span>
      <button
        type="button"
        className="room-code__copy"
        data-testid="room-copy-code"
        title={en.room.copyTitle}
        onClick={() => {
          // Clipboard needs a secure context (https or localhost); on a LAN address it is
          // missing, and the code is still there to read.
          void navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        {copied ? en.room.copied : en.room.copy}
      </button>
    </div>
  );
}

/** ui-spec §6 Room (waiting). */
export function RoomScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const room = useGame((s) => s.room);
  const you = useGame((s) => s.you);
  const leftRoom = useGame((s) => s.leftRoom);
  const [name] = usePlayerName();

  if (!room || room.code !== code) {
    // Opened by link or after a server restart: offer to join instead of guessing.
    return (
      <main className="screen center">
        <Panel title={`${en.room.code} ${code ?? ''}`}>
          <div className="row">
            <Button
              onClick={() =>
                code && send({ type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: name })
              }
            >
              {en.lobby.joinButton}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/lobby')}>
              {en.common.back}
            </Button>
          </div>
        </Panel>
      </main>
    );
  }

  const ids = (Object.keys(room.seats) as PlayerId[]).sort();
  const seats = ids.map((p) => room.seats[p]);
  const ready = seats.filter((s) => s?.ready).length;
  const notReady = ids.filter((p) => room.seats[p] && !room.seats[p]?.ready);
  const open = ids.filter((p) => !room.seats[p]).length;
  const mySeat = you?.seat && you.seat !== 'SPECTATOR' ? you.seat : null;
  const meReady = mySeat ? !!room.seats[mySeat]?.ready : false;
  const allSet = open === 0 && notReady.length === 0;
  const canStart = !!you?.host && allSet;
  const status = allSet
    ? you?.host
      ? en.room.allReadyHost
      : en.room.allReadyGuest
    : en.room.waitingFor(
        notReady.map((p) => (p === mySeat ? `${en.room.you} (${p})` : p)),
        open,
      );

  const leave = () => {
    send({ type: 'LEAVE' });
    leftRoom();
    navigate('/lobby');
  };

  return (
    <main className="screen room">
      <header className="screen__header room__header">
        <div>
          <div className="caption room__kicker">{en.room.kicker}</div>
          <div className="row wrap">
            <h1>{room.name}</h1>
            <Pill tone={room.mode === 'SOLO' ? 'blue' : 'purple'}>{en.modes[room.mode]}</Pill>
            <Pill tone="grey">
              {room.visibility === 'PUBLIC' ? en.room.public : en.room.private}
            </Pill>
          </div>
        </div>
        <div className="row">
          <CopyCode code={room.code} />
          <Button variant="danger" size="small" onClick={leave} data-testid="room-leave">
            {en.room.leave}
          </Button>
        </div>
      </header>

      <div className={`room__stage room__stage--${room.mode.toLowerCase()}`}>
        <TeamColumn side="BLUE" />
        <Versus room={room} />
        <TeamColumn side="RED" />
        <div className="room__side">
          <MatchSettings
            config={room.settings}
            botLevel={room.botLevel}
            editable={!!you?.host}
            onChange={(settings) => send({ type: 'UPDATE_SETTINGS', settings })}
          />
          <Panel className="room__go" accent={allSet ? 'gold' : undefined}>
            <div className="room__status">
              <span className="ready-dots" aria-hidden="true">
                {seats.map((s, i) => (
                  <i key={ids[i]} className={s?.ready ? 'is-on' : ''} />
                ))}
              </span>
              <span className="pill pill--neutral" data-testid="room-ready-count">
                {ready} / {seats.length} {en.room.ready}
              </span>
              <span className="room__status-text" data-testid="room-status">
                {status}
              </span>
            </div>
            {you?.seat === 'SPECTATOR' && <p className="muted">{en.room.spectating}</p>}
            <div className="room__actions">
              {mySeat && (
                <Button
                  variant="secondary"
                  data-testid="room-ready"
                  onClick={() => send({ type: 'READY', ready: !meReady })}
                >
                  {meReady ? en.room.notReadyButton : en.room.readyButton}
                </Button>
              )}
              {you?.host && (
                <Button
                  data-testid="room-start"
                  className={canStart ? '' : 'btn--waiting'}
                  disabled={!canStart}
                  onClick={() => send({ type: 'START_GAME' })}
                >
                  {en.room.start}
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
