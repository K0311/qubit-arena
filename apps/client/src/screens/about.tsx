import { useNavigate } from 'react-router';
import { CARD_KINDS } from '@qa/engine';
import { GateCard } from '../components/cards/gate-card';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { en } from '../i18n/en';

/**
 * About and card library (ui-spec §8): every card at detail size, with its rotation axis on a
 * small Bloch sphere and the board effect generated from the engine.
 */
export function AboutScreen() {
  const navigate = useNavigate();
  const t = en.about;
  return (
    <main className="screen about">
      <header className="screen__header">
        <h1>{t.title}</h1>
        <Button variant="secondary" size="small" onClick={() => navigate(-1)}>
          {en.common.back}
        </Button>
      </header>
      <Panel>
        <p>{t.intro}</p>
        <p className="muted">{t.credit}</p>
      </Panel>
      <h2 className="about__heading">{t.library}</h2>
      <p className="muted">{t.libraryNote}</p>
      <div className="about__cards" data-testid="card-library">
        {CARD_KINDS.map((k) => (
          <GateCard key={k} kind={k} size="detail" data-testid={`library-card-${k}`} />
        ))}
      </div>
      <p className="caption about__footer">
        {en.app.version} · {en.app.footer}
      </p>
    </main>
  );
}
