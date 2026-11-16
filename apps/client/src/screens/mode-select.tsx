import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { BotLevel } from '@qa/engine';
import { Button } from '../components/ui/button';
import { Pill } from '../components/ui/pill';
import { en } from '../i18n/en';
import { send } from '../net/connection';
import { usePlayerName } from '../state/player-name';
import { BotLevelPicker } from './bot-level';

function People({ n, bots = 0 }: { n: number; bots?: number }) {
  return (
    <span className="mode-card__icon" aria-hidden="true">
      {'👤'.repeat(n)}
      {'🤖'.repeat(bots)}
    </span>
  );
}

/**
 * ui-spec §4 Mode select: the two online modes, plus Bot Arena (play against server bots at
 * once, in a private room). There is still no local or hot-seat mode.
 */
export function ModeSelect() {
  const navigate = useNavigate();
  const [name] = usePlayerName();
  const [level, setLevel] = useState<BotLevel>('NORMAL');
  const cards = [
    { id: 'solo', icon: 2, title: en.mode.soloTitle, text: en.mode.soloText, frame: 'blue' },
    { id: 'team', icon: 4, title: en.mode.teamTitle, text: en.mode.teamText, frame: 'purple' },
  ] as const;
  // The server answers with ROOM_STATE (PLAYING), and the app shell opens the game screen.
  const botGame = (mode: 'SOLO' | 'TEAM') =>
    send({ type: 'BOT_GAME', mode, playerName: name, level });
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>{en.mode.title}</h1>
        <Button variant="secondary" size="small" onClick={() => navigate('/')}>
          {en.common.back}
        </Button>
      </header>
      <div className="mode-grid">
        {cards.map((c) => (
          <article key={c.id} className={`mode-card panel panel--${c.frame}`}>
            <Pill tone="green">{en.mode.online}</Pill>
            <People n={c.icon} />
            <h2>{c.title}</h2>
            <p>{c.text}</p>
            <Button data-testid={`mode-${c.id}`} onClick={() => navigate(`/lobby?mode=${c.id}`)}>
              {en.mode.select}
            </Button>
          </article>
        ))}
        <article className="mode-card panel panel--cyan" data-testid="mode-bot">
          <Pill tone="cyan">{en.mode.botBadge}</Pill>
          <People n={1} bots={1} />
          <h2>{en.mode.botTitle}</h2>
          <p>{en.mode.botText}</p>
          <BotLevelPicker value={level} onChange={setLevel} testId="mode-bot-level" />
          <div className="row wrap">
            <Button data-testid="mode-bot-solo" onClick={() => botGame('SOLO')}>
              {en.mode.botSolo}
            </Button>
            <Button variant="secondary" data-testid="mode-bot-team" onClick={() => botGame('TEAM')}>
              {en.mode.botTeam}
            </Button>
          </div>
        </article>
      </div>
    </main>
  );
}
