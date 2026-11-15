import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Mode } from '@qa/engine';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { Pill } from '../components/ui/pill';
import { en } from '../i18n/en';
import { minutesSeconds } from '../lib/format';
import { send } from '../net/connection';
import { usePlayerName } from '../state/player-name';
import { useGame } from '../state/store';

type Filter = 'all' | 'solo' | 'team';
const LIST_EVERY_MS = 3000;

const toMode = (f: Filter): Mode | undefined =>
  f === 'solo' ? 'SOLO' : f === 'team' ? 'TEAM' : undefined;

function RoomList({ filter }: { filter: Filter }) {
  const rooms = useGame((s) => s.roomList);
  const status = useGame((s) => s.status);
  const [name] = usePlayerName();

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
  if (rooms.length === 0) return <p className="muted">{en.lobby.empty}</p>;
  return (
    <table className="room-table" data-testid="room-list">
      <thead>
        <tr className="caption">
          <th>{en.lobby.room}</th>
          <th>{en.lobby.modeCol}</th>
          <th>{en.lobby.players}</th>
          <th>{en.lobby.settings}</th>
          <th>{en.lobby.status}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rooms.map((r) => {
          const open = r.status === 'WAITING' && r.players < r.seats;
          return (
            <tr key={r.code}>
              <td>
                <strong>{r.name}</strong>
                <div className="ket muted small">{r.code}</div>
              </td>
              <td>
                <Pill tone={r.mode === 'SOLO' ? 'blue' : 'purple'}>{en.modes[r.mode]}</Pill>
              </td>
              <td className="ket">
                {r.players} / {r.seats}
              </td>
              <td>
                {r.settings.targetScore} pts · {minutesSeconds(r.settings.timeLimitMs)}
              </td>
              <td>
                <Pill tone={r.status === 'WAITING' ? 'green' : 'grey'}>
                  {r.status === 'WAITING' ? en.lobby.waiting : en.lobby.playing}
                </Pill>
              </td>
              <td>
                <Button
                  size="small"
                  variant={open ? 'primary' : 'secondary'}
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SidePanels({ defaultMode }: { defaultMode: Mode }) {
  const [name] = usePlayerName();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [roomName, setRoomName] = useState(en.lobby.defaultRoomName(name).slice(0, 40));
  const [code, setCode] = useState('');
  useEffect(() => setMode(defaultMode), [defaultMode]);

  return (
    <div className="lobby__side">
      <Panel title={en.lobby.quick} accent="cyan">
        <p className="muted">{en.lobby.quickHint}</p>
        <div className="row">
          <Button
            data-testid="lobby-quick-solo"
            onClick={() => send({ type: 'QUICK_MATCH', mode: 'SOLO', playerName: name })}
          >
            {en.lobby.solo}
          </Button>
          <Button
            data-testid="lobby-quick-team"
            onClick={() => send({ type: 'QUICK_MATCH', mode: 'TEAM', playerName: name })}
          >
            {en.lobby.team}
          </Button>
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
          <div className="segmented" role="radiogroup" aria-label={en.lobby.modeCol}>
            {(['SOLO', 'TEAM'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? 'is-on' : ''}
                onClick={() => setMode(m)}
              >
                {en.modes[m]}
              </button>
            ))}
          </div>
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
  const raw = params.get('mode');
  const filter: Filter = raw === 'solo' || raw === 'team' ? raw : 'all';
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: en.lobby.all },
    { id: 'solo', label: en.lobby.solo },
    { id: 'team', label: en.lobby.team },
  ];
  return (
    <main className="screen lobby">
      <header className="screen__header">
        <div className="row">
          <h1>{en.lobby.title}</h1>
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
        </div>
        <Button variant="secondary" size="small" onClick={() => navigate('/play')}>
          {en.common.back}
        </Button>
      </header>
      <div className="lobby__grid">
        <Panel title={en.lobby.rooms} className="lobby__rooms">
          <RoomList filter={filter} />
        </Panel>
        <SidePanels defaultMode={toMode(filter) ?? 'SOLO'} />
      </div>
    </main>
  );
}
