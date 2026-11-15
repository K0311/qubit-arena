import { useState } from 'react';
import { useNavigate } from 'react-router';
import { boardPoint, POSITIONS } from '@qa/engine';
import { Button } from '../components/ui/button';
import { en } from '../i18n/en';
import { usePlayerName } from '../state/player-name';
import { KET } from '../lib/format';

function PlayerBadge() {
  const [name, setName] = usePlayerName();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing) {
    return (
      <form
        className="badge"
        onSubmit={(e) => {
          e.preventDefault();
          setName(draft);
          setEditing(false);
        }}
      >
        <input
          aria-label={en.badge.edit}
          value={draft}
          maxLength={24}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="small" type="submit">
          {en.badge.save}
        </Button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="badge"
      data-testid="player-badge"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title={en.badge.edit}
    >
      <span className="caption">{en.badge.label}</span>
      <span className="badge__name">{name}</span>
    </button>
  );
}

/**
 * The six states on a ring, as a static decorative scene (ui-spec §4, round 4). Placed with the
 * engine's boardPoint() so it matches the real board (|+⟩ at the top).
 */
function MenuScene() {
  return (
    <div className="menu-scene" aria-hidden="true">
      <div className="menu-scene__orbit" />
      <div className="menu-scene__orbit menu-scene__orbit--2" />
      {POSITIONS.map((s) => (
        <span
          key={s}
          className={`menu-scene__node menu-scene__node--${s.toLowerCase()}`}
          style={{
            // boardPoint has y up; CSS has y down. 42 px is half a node.
            left: `calc(50% + ${boardPoint(s).x * 41}% - 42px)`,
            top: `calc(50% - ${boardPoint(s).y * 41}% - 42px)`,
          }}
        >
          <span className="ket">{KET[s]}</span>
        </span>
      ))}
      <span className="menu-scene__ball">🏈</span>
    </div>
  );
}

/** ui-spec §4 Main menu. */
export function MainMenu() {
  const navigate = useNavigate();
  return (
    <main className="screen menu">
      <header className="menu__top">
        <PlayerBadge />
      </header>
      <div className="menu__body">
        <div className="menu__left">
          <h1 className="logo">{en.app.title}</h1>
          <p className="menu__tagline">{en.app.tagline}</p>
          <p className="menu__pitch">{en.app.pitch}</p>
          <nav className="menu__buttons">
            <Button data-testid="menu-play" onClick={() => navigate('/play')}>
              {en.menu.play}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/tutorial')}>
              {en.menu.tutorial}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              {en.menu.settings}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/about')}>
              {en.menu.about}
            </Button>
          </nav>
        </div>
        <MenuScene />
      </div>
      <footer className="menu__footer caption">
        {en.app.version} · {en.app.footer}
      </footer>
    </main>
  );
}
