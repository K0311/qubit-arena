import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/panel';
import { en } from '../i18n/en';

/** Routes that later tasks fill in (tutorial P-5.3, settings P-4.3, about P-5.2, study P-7.3). */
export function Placeholder({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>{title.toUpperCase()}</h1>
        <Button variant="secondary" size="small" onClick={() => navigate('/')}>
          {en.common.back}
        </Button>
      </header>
      <Panel>
        <p className="muted">{en.placeholder.soon}</p>
      </Panel>
    </main>
  );
}
