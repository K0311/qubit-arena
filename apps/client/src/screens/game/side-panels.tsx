import { useState } from 'react';
import {
  CARD_KINDS,
  sideOf,
  type Card,
  type CardKind,
  type Mode,
  type PlayerId,
  type Side,
} from '@qa/engine';
import type { Room } from '@qa/protocol';
import { GateTag, effectText } from '../../components/cards/gate-card';
import { PlayerChip } from '../../components/ui/player-chip';
import { en } from '../../i18n/en';
import type { GameViewData } from '../../state/store';

type TeamPanelProps = {
  side: Side;
  mode: Mode;
  room: Room;
  view: GameViewData;
  you: PlayerId | null;
};

/**
 * ui-spec §7.1 team panels. The teammate's hand shows as gate tags (rules.md §9); everyone
 * else is a card count only, because the server never sends their cards.
 */
export function TeamPanel({ side, mode, room, view, you }: TeamPanelProps) {
  const seats = (Object.keys(view.handCounts) as PlayerId[])
    .filter((p) => sideOf(mode, p) === side)
    .sort();
  return (
    <section
      className={`game-team panel panel--${side === 'BLUE' ? 'blue' : 'red'}`}
      aria-label={side === 'BLUE' ? en.game.blueTeam : en.game.redTeam}
    >
      <h2 className="panel__title">{side === 'BLUE' ? en.game.blueTeam : en.game.redTeam}</h2>
      {seats.map((p) => {
        const info = room.seats[p];
        const count = view.handCounts[p] ?? 0;
        const mateHand: readonly Card[] | undefined = p !== you ? view.hands[p] : undefined;
        return (
          <div
            key={p}
            className="game-team__seat"
            data-testid={p !== you && !mateHand ? `opponent-count-${p}` : undefined}
            data-count={count}
          >
            <PlayerChip
              seat={p}
              side={side}
              name={info?.name ?? p}
              cardCount={count}
              active={view.turn === p && view.phase === 'PLAYING'}
              you={p === you}
              bot={info?.bot ?? false}
              connected={info?.connected ?? true}
            />
            {mateHand && (
              <div className="game-team__mate" aria-label={en.game.mateHand}>
                {mateHand.map((c) => (
                  <GateTag key={c.id} kind={c.kind} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * ui-spec §7.1 gate reference: one row per card with its board moves from the engine.
 * In the side panel each card is one line (tag, name, short label) and opens to its moves on
 * click: the full list in a monospace wall was too dense to scan mid-game. The help modal
 * (`full`) still lists every move. Selecting a hand card (`focus`) opens that gate's row.
 */
export function GateReference({
  full = false,
  focus = null,
}: {
  full?: boolean;
  focus?: CardKind | null;
}) {
  const [open, setOpen] = useState<CardKind | null>(focus);
  // Follow the selected hand card, adjusting during render rather than in an effect.
  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus) setOpen(focus);
  }
  return (
    <section
      className={`game-ref panel${full ? ' game-ref--full' : ''}`}
      aria-label={en.game.gateReference}
    >
      <h2 className="panel__title">{en.game.gateReference}</h2>
      {!full && <p className="game-ref__hint">{en.game.gateReferenceHint}</p>}
      <ul>
        {CARD_KINDS.map((k) => {
          const shown = full || open === k;
          return (
            <li key={k} className={shown ? 'is-open' : undefined}>
              <button
                type="button"
                className="game-ref__row"
                aria-expanded={shown}
                disabled={full}
                onClick={() => setOpen(open === k ? null : k)}
                data-testid={`gate-ref-${k}`}
              >
                <GateTag kind={k} />
                <span className="game-ref__name">{en.cards[k].name}</span>
                <span className="game-ref__footer">{en.cards[k].footer}</span>
              </button>
              {shown && <p className="game-ref__moves ket">{effectText(k)}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
