import type { PlayerId, Side } from '@qa/engine';
import { en } from '../../i18n/en';

type Props = {
  seat: PlayerId;
  side: Side;
  name: string;
  /** Shown during the game; opponents' hands are a count only (rules.md §9). */
  cardCount?: number;
  /** Whose turn it is: gold border and glow. */
  active?: boolean;
  you?: boolean;
  host?: boolean;
  bot?: boolean;
  connected?: boolean;
};

/**
 * Team, seat, name, card count, active (ui-spec §7). Colour is never the only signal: the side
 * and seat are written out too (ui-spec §1).
 */
export function PlayerChip({
  seat,
  side,
  name,
  cardCount,
  active = false,
  you = false,
  host = false,
  bot = false,
  connected = true,
}: Props) {
  const classes = [
    'chip',
    side === 'BLUE' ? 'chip--blue' : 'chip--red',
    active ? 'chip--active' : '',
    connected ? '' : 'chip--away',
  ]
    .filter(Boolean)
    .join(' ');
  const tags = [
    you ? en.room.you : null,
    host ? en.room.host : null,
    bot ? en.room.bot : null,
    !connected && !bot ? en.room.away : null,
  ].filter(Boolean);
  return (
    <div
      className={classes}
      data-testid={`player-chip-${seat}`}
      data-active={active || undefined}
      aria-label={`${side} ${seat} ${name}`}
    >
      <span className="chip__seat">
        <span className="chip__side">{side}</span>
        {seat}
      </span>
      <span className="chip__name">{name}</span>
      {tags.length > 0 && <span className="chip__tags">{tags.join(' · ')}</span>}
      {cardCount !== undefined && (
        <span className="chip__count" aria-label={`${cardCount} cards`}>
          🂠 {cardCount}
        </span>
      )}
    </div>
  );
}
