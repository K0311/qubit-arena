import { useNavigate, useParams } from 'react-router';
import { END_ZONE, sideOf, type PlayerId, type Side } from '@qa/engine';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { Pill } from '../components/ui/pill';
import { PlayerChip } from '../components/ui/player-chip';
import { en } from '../i18n/en';
import { KET } from '../lib/format';
import { send } from '../net/connection';
import { usePlayerName } from '../state/player-name';
import { useGame } from '../state/store';
import { MatchSettings } from './match-settings';

function TeamColumn({ side }: { side: Side }) {
  const room = useGame((s) => s.room);
  const you = useGame((s) => s.you);
  if (!room) return null;
  const seats = (Object.keys(room.seats) as PlayerId[])
    .sort()
    .filter((p) => sideOf(room.mode, p) === side);
  return (
    <Panel
      className={`team-col team-col--${side.toLowerCase()}`}
      accent={side === 'BLUE' ? 'blue' : 'red'}
      data-testid={`team-${side.toLowerCase()}`}
    >
      <h2 className={`team-col__title team-col__title--${side.toLowerCase()}`}>
        {side === 'BLUE' ? en.room.blueTeam : en.room.redTeam}
      </h2>
      <p className="muted">
        {en.room.blueZone} <span className="ket">{KET[END_ZONE[side]]}</span>
      </p>
      <div className="team-col__seats">
        {seats.map((p) => {
          const seat = room.seats[p];
          if (!seat) {
            return (
              <button
                key={p}
                type="button"
                className="seat-empty"
                data-testid={`seat-${p}`}
                onClick={() => send({ type: 'TAKE_SEAT', seat: p })}
                title={en.room.takeSeat}
              >
                <span className="ket">{p}</span> {en.room.waitingSeat}
              </button>
            );
          }
          return (
            <div key={p} className="seat" data-testid={`seat-${p}`}>
              <PlayerChip
                seat={p}
                side={side}
                name={seat.name}
                you={you?.seat === p}
                host={seat.host}
                bot={seat.bot}
                connected={seat.connected}
              />
              {seat.ready && <Pill tone="green">✓ {en.room.ready}</Pill>}
            </div>
          );
        })}
      </div>
    </Panel>
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

  const seats = Object.values(room.seats);
  const filled = seats.filter(Boolean).length;
  const ready = seats.filter((s) => s?.ready).length;
  const mySeat = you?.seat && you.seat !== 'SPECTATOR' ? you.seat : null;
  const meReady = mySeat ? !!room.seats[mySeat]?.ready : false;
  const canStart = !!you?.host && filled === seats.length && ready === seats.length;

  const leave = () => {
    send({ type: 'LEAVE' });
    leftRoom();
    navigate('/lobby');
  };

  return (
    <main className="screen room">
      <header className="screen__header">
        <div className="row wrap">
          <h1>{room.name}</h1>
          <Pill tone={room.mode === 'SOLO' ? 'blue' : 'purple'}>{en.modes[room.mode]}</Pill>
          <Pill tone="cyan" testId="room-code">
            {en.room.code} <span className="ket">{room.code}</span>
          </Pill>
          <Pill tone={ready === seats.length ? 'green' : 'neutral'} testId="room-ready-count">
            {ready} / {seats.length} {en.room.ready}
          </Pill>
        </div>
        <Button variant="danger" size="small" onClick={leave} data-testid="room-leave">
          {en.room.leave}
        </Button>
      </header>

      <div className="room__grid">
        <div className="room__teams">
          <div className="room__team-row">
            <TeamColumn side="BLUE" />
            <TeamColumn side="RED" />
          </div>
          <p className="muted">
            {room.mode === 'TEAM' ? en.room.turnOrderTeam : en.room.turnOrderSolo}
          </p>
          {you?.seat === 'SPECTATOR' && <p className="muted">{en.room.spectating}</p>}
        </div>
        <div className="room__side">
          <MatchSettings
            config={room.settings}
            editable={!!you?.host}
            onChange={(settings) => send({ type: 'UPDATE_SETTINGS', settings })}
          />
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
                disabled={!canStart}
                onClick={() => send({ type: 'START_GAME' })}
              >
                {en.room.start}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
