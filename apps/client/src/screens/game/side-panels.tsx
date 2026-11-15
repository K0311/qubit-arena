import { CARD_KINDS, sideOf, type Card, type Mode, type PlayerId, type Side } from '@qa/engine';
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

/** ui-spec §7.1 gate reference: one row per card with its board moves from the engine. */
export function GateReference() {
  return (
    <section className="game-ref panel" aria-label={en.game.gateReference}>
      <h2 className="panel__title">{en.game.gateReference}</h2>
      <ul>
        {CARD_KINDS.map((k) => (
          <li key={k}>
            <GateTag kind={k} />
            <span className="ket">{effectText(k)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
