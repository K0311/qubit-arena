import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Pill } from '../components/ui/pill';
import { en } from '../i18n/en';

function People({ n }: { n: number }) {
  return (
    <span className="mode-card__icon" aria-hidden="true">
      {'👤'.repeat(n)}
    </span>
  );
}

/** ui-spec §4 Mode select: two cards, both ONLINE; no local or hot-seat mode. */
export function ModeSelect() {
  const navigate = useNavigate();
  const cards = [
    { id: 'solo', icon: 2, title: en.mode.soloTitle, text: en.mode.soloText, frame: 'blue' },
    { id: 'team', icon: 4, title: en.mode.teamTitle, text: en.mode.teamText, frame: 'purple' },
  ] as const;
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
      </div>
    </main>
  );
}
