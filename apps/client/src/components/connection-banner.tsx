import { useGame } from '../state/store';
import { en } from '../i18n/en';

/** "Waiting for server" is a banner, not a route (ui-spec §3). */
export function ConnectionBanner() {
  const status = useGame((s) => s.status);
  if (status === 'open' || status === 'idle') return null;
  return (
    <div className="net-banner" role="status" data-testid="net-status">
      <span className="spinner" aria-hidden="true" />
      {status === 'reconnecting' ? en.net.reconnecting : en.net.connecting}
    </div>
  );
}
