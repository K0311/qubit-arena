import type { Room } from '@qa/protocol';
import { en } from '../../i18n/en';
import { CARD_LABEL } from '../../lib/format';
import type { LogRow } from '../../lib/game-log';
import { gateColors } from '../../theme/tokens';

function Dot({ row }: { row: LogRow }) {
  if (row.kind === 'touchdown') return <span className="log__dot log__dot--star">★</span>;
  if (row.measured) return <span className="log__dot log__dot--gauge">◔</span>;
  const tone = row.side === 'BLUE' ? 'blue' : row.side === 'RED' ? 'red' : 'neutral';
  return <span className={`log__dot log__dot--${tone}`}>●</span>;
}

/** ui-spec §7.5: newest at the top, the whole game, built only from engine events. */
export function ActionLog({ rows, room }: { rows: readonly LogRow[]; room: Room }) {
  return (
    <section className="game-log panel" aria-label={en.game.actionLog}>
      <h2 className="panel__title">{en.game.actionLog}</h2>
      <ol className="log" data-testid="action-log">
        {rows.length === 0 && <li className="log__empty muted">{en.log.empty}</li>}
        {[...rows].reverse().map((r) => (
          <li key={r.index} className={`log__row log__row--${r.kind}`}>
            <Dot row={r} />
            <span className="log__time ket">{r.time ?? ''}</span>
            <span className="log__text">
              {r.seat && r.kind === 'card' ? (
                <>
                  <b title={room.seats[r.seat]?.name}>{r.seat}</b> {r.text}{' '}
                  <b style={{ color: r.card ? gateColors[r.card] : undefined }}>
                    {r.card ? CARD_LABEL[r.card] : ''}
                  </b>
                  {r.timeout && <span className="log__timeout"> {en.log.timeout}</span>}
                </>
              ) : (
                r.text
              )}
            </span>
            <span className="log__result ket">{r.result}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
