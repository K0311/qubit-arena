import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Mode } from '@qa/engine';
import type { RoomSummary } from '@qa/protocol';
import { roomPath } from '../components/in-room-bar';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { Pill } from '../components/ui/pill';
import { en } from '../i18n/en';
import { minutesSeconds } from '../lib/format';
import { send } from '../net/connection';
import { usePlayerName } from '../state/player-name';
import { useGame } from '../state/store';
import { stateColors } from '../theme/state-colors';

type Filter = 'all' | 'solo' | 'team';
const LIST_EVERY_MS = 3000;

const toMode = (f: Filter): Mode | undefined =>
  f === 'solo' ? 'SOLO' : f === 'team' ? 'TEAM' : undefined;

/**
 * One dot per seat, filled for each player in the room. The room list only carries a count
 * (protocol RoomSummary), so the dots do not claim which team a player sits on.
 */
function SeatDots({ filled, seats }: { filled: number; seats: number }) {
  return (
    <span className="seat-dots" aria-label={`${filled} / ${seats}`}>
      {Array.from({ length: seats }, (_, i) => (
        <i key={i} className={`seat-dot ${i < filled ? 'is-on' : ''}`} />
      ))}
      <span className="ket muted">
        {filled}/{seats}
      </span>
    </span>
  );
}

function RoomRow({ r }: { r: RoomSummary }) {
  const [name] = usePlayerName();
  const mine = useGame((s) => s.room);
  const navigate = useNavigate();
  const open = r.status === 'WAITING' && r.players < r.seats;
  // Our own room shows up in the list after the browser's Back button; joining it again only
  // earns an error, so the button takes the player back to it instead.
  const isMine = mine?.code === r.code;
  return (
    <li
      className={`lobby-room ${open ? '' : 'lobby-room--live'}`}
      data-testid={`room-row-${r.code}`}
    >
      <div className="lobby-room__name">
        <strong title={r.name}>{r.name}</strong>
        <span className="ket muted small">{r.code}</span>
      </div>
      <span>
        <Pill tone={r.mode === 'SOLO' ? 'blue' : 'purple'}>{en.modes[r.mode]}</Pill>
      </span>
      <SeatDots filled={r.players} seats={r.seats} />
      <span className="muted">
        {r.settings.targetScore} pts ·{' '}
        <span className="ket">{minutesSeconds(r.settings.timeLimitMs)}</span>
      </span>
      <span>
        <Pill tone={r.status === 'WAITING' ? 'green' : 'grey'}>
          {r.status === 'WAITING' ? en.lobby.waiting : en.lobby.playing}
        </Pill>
      </span>
      {isMine ? (
        <Button
          size="small"
          data-testid={`room-row-${r.code}-join`}
          onClick={() => navigate(roomPath(mine.code, mine.status))}
        >
          {mine.status === 'WAITING' ? en.lobby.backToRoom : en.lobby.backToGame}
        </Button>
      ) : (
        <Button
          size="small"
          variant={open ? 'primary' : 'secondary'}
          data-testid={`room-row-${r.code}-join`}
          onClick={() =>
            send({
              type: 'JOIN_ROOM',
              code: r.code,
              role: open ? 'PLAYER' : 'SPECTATOR',
              playerName: name,
            })
          }
        >
          {open ? en.lobby.join : en.lobby.watch}
        </Button>
      )}
    </li>
  );
}

/** The six state domes in a ring, as on the main menu, around an empty ball spot. */
function EmptyRing() {
  const spots: [keyof typeof stateColors, number, number][] = [
    ['PLUS', 50, 0],
    ['MINUS_I', 88, 30],
    ['ONE', 80, 78],
    ['MINUS', 50, 96],
    ['PLUS_I', 20, 78],
    ['ZERO', 12, 30],
  ];
  return (
    <div className="empty-ring" aria-hidden="true">
      <div className="empty-ring__orbit" />
      {spots.map(([pos, x, y]) => (
        <i
          key={pos}
          className="empty-ring__dome"
          style={{ left: `${x}%`, top: `${y}%`, background: stateColors[pos] }}
        />
      ))}
      <i className="empty-ring__ball" />
    </div>
  );
}

function RoomList({ filter, rooms }: { filter: Filter; rooms: RoomSummary[] | null }) {
  const status = useGame((s) => s.status);

  // The server has no lobby push yet, so ask again every few seconds while the list is open.
  useEffect(() => {
    if (status !== 'open') return;
    const mode = toMode(filter);
    const ask = () => send(mode ? { type: 'LIST_ROOMS', mode } : { type: 'LIST_ROOMS' });
    ask();
    const t = setInterval(ask, LIST_EVERY_MS);
    return () => clearInterval(t);
  }, [filter, status]);

  if (!rooms) return <p className="muted">{en.common.loading}</p>;
  if (rooms.length === 0) {
    return (
      <div className="lobby-empty" data-testid="lobby-empty">
        <EmptyRing />
        <h2>{en.lobby.emptyTitle}</h2>
        <p className="muted">{en.lobby.emptyBody}</p>
      </div>
    );
  }
  return (
    <div className="lobby-rooms__list">
      <div className="lobby-room lobby-room--head caption" aria-hidden="true">
        <span>{en.lobby.room}</span>
        <span>{en.lobby.modeCol}</span>
        <span>{en.lobby.players}</span>
        <span>{en.lobby.settings}</span>
        <span>{en.lobby.status}</span>
        <span />
      </div>
      <ul className="lobby-rooms__rows" data-testid="room-list">
        {rooms.map((r) => (
          <RoomRow key={r.code} r={r} />
        ))}
      </ul>
    </div>
  );
}

function QuickTile({ mode }: { mode: Mode }) {
  const [name] = usePlayerName();
  const seats = mode === 'SOLO' ? ['blue', 'red'] : ['blue', 'blue', 'red', 'red'];
  return (
    <button
      type="button"
      className="quick-tile"
      data-testid={`lobby-quick-${mode.toLowerCase()}`}
      onClick={() => send({ type: 'QUICK_MATCH', mode, playerName: name })}
    >
      <span className="quick-tile__title">{en.modes[mode]}</span>
      <span className="quick-tile__seats" aria-hidden="true">
        {seats.map((s, i) => (
          <i key={i} className={`seat-dot seat-dot--${s}`} />
        ))}
      </span>
      <span className="muted small">
        {mode === 'SOLO' ? en.lobby.soloPlayers : en.lobby.teamPlayers}
      </span>
    </button>
  );
}

/**
 * `locked` is the mode picked on the mode select screen. The player already chose it there, so
 * the lobby does not ask again: only that quick match tile, and no mode switch when creating.
 */
function SidePanels({ locked }: { locked: Mode | undefined }) {
  const [name] = usePlayerName();
  const [picked, setPicked] = useState<Mode>('SOLO');
  const mode = locked ?? picked;
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [roomName, setRoomName] = useState(en.lobby.defaultRoomName(name).slice(0, 40));
  const [code, setCode] = useState('');
  const quickModes: Mode[] = locked ? [locked] : ['SOLO', 'TEAM'];

  return (
    <div className="lobby__side">
      <Panel title={en.lobby.quick} accent="cyan">
        <p className="muted">{en.lobby.quickHint}</p>
        <div className="quick-tiles">
          {quickModes.map((m) => (
            <QuickTile key={m} mode={m} />
          ))}
        </div>
      </Panel>

      <Panel title={en.lobby.create}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            send({
              type: 'CREATE_ROOM',
              mode,
              visibility,
              name: roomName.trim() || en.lobby.defaultRoomName(name),
              playerName: name,
            });
          }}
        >
          <div className="row wrap">
            {!locked && (
              <div className="segmented" role="radiogroup" aria-label={en.lobby.modeCol}>
                {(['SOLO', 'TEAM'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    className={mode === m ? 'is-on' : ''}
                    onClick={() => setPicked(m)}
                  >
                    {en.modes[m]}
                  </button>
                ))}
              </div>
            )}
            <div className="segmented" role="radiogroup" aria-label="Visibility">
              {(['PUBLIC', 'PRIVATE'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === v}
                  className={visibility === v ? 'is-on' : ''}
                  onClick={() => setVisibility(v)}
                >
                  {v === 'PUBLIC' ? en.lobby.public : en.lobby.private}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="caption">{en.lobby.roomName}</span>
            <input
              value={roomName}
              maxLength={40}
              onChange={(e) => setRoomName(e.target.value)}
              data-testid="lobby-room-name"
            />
          </label>
          <Button type="submit" data-testid="lobby-create">
            {en.lobby.createButton}
          </Button>
        </form>
      </Panel>

      <Panel title={en.lobby.joinByCode}>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = code.trim().toUpperCase();
            if (clean) send({ type: 'JOIN_ROOM', code: clean, role: 'PLAYER', playerName: name });
          }}
        >
          <input
            className="ket code-input"
            aria-label={en.lobby.joinByCode}
            placeholder={en.lobby.codePlaceholder}
            value={code}
            maxLength={13}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            data-testid="lobby-code"
          />
          <Button type="submit" variant="secondary">
            {en.lobby.joinButton}
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/** ui-spec §5 Lobby. */
export function Lobby() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rooms = useGame((s) => s.roomList);
  const raw = params.get('mode');
  const filter: Filter = raw === 'solo' || raw === 'team' ? raw : 'all';
  const locked = toMode(filter);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: en.lobby.all },
    { id: 'solo', label: en.lobby.solo },
    { id: 'team', label: en.lobby.team },
  ];
  return (
    <main className="screen lobby">
      <header className="screen__header lobby__header">
        <div>
          <div className="caption lobby__kicker">{en.lobby.kicker}</div>
          <div className="row">
            <h1>{en.lobby.title}</h1>
            {locked && (
              <span data-testid="lobby-mode">
                <Pill tone={locked === 'SOLO' ? 'blue' : 'purple'}>{en.modes[locked]}</Pill>
              </span>
            )}
          </div>
        </div>
        <Button variant="secondary" size="small" onClick={() => navigate('/play')}>
          {en.common.back}
        </Button>
      </header>
      <div className="lobby__grid">
        <Panel className="lobby-rooms">
          <div className="lobby-rooms__head">
            <div className="row">
              <h2 className="panel__title">{en.lobby.rooms}</h2>
              <span data-testid="lobby-room-count">
                <Pill tone={rooms && rooms.length > 0 ? 'green' : 'grey'}>
                  {en.lobby.roomCount(rooms?.length ?? 0)}
                </Pill>
              </span>
            </div>
            <div className="row wrap">
              <span className="lobby-live">
                <i aria-hidden="true" />
                {en.lobby.live}
              </span>
              {!locked && (
                <div className="segmented" role="tablist">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.id}
                      className={filter === f.id ? 'is-on' : ''}
                      onClick={() => setParams(f.id === 'all' ? {} : { mode: f.id })}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <RoomList filter={filter} rooms={rooms} />
        </Panel>
        <SidePanels locked={locked} />
      </div>
    </main>
  );
}
