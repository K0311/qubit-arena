import { useEffect, useRef, useState } from 'react';
import { sideOf, type GameEvent, type Mode, type PlayerId, type Side } from '@qa/engine';
import type { Room } from '@qa/protocol';
import { en } from '../../i18n/en';
import { send } from '../../net/connection';
import { matchStats } from '../../lib/match-stats';
import type { GameViewData } from '../../state/store';

type Question = { id: string; prompt: string; choices: readonly string[] };
type ResultEvent = Extract<GameEvent, { type: 'CHALLENGE_RESULT' }>;
export type Reveal = { question: Question; result: ResultEvent };

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const REVEAL_MS = 3000;

/**
 * Remembers each question while it is on screen, so the correct answer can be shown for 3 s
 * after the server has already moved on to the next question or ended the game (ui-spec §9).
 */
export function useChallengeReveal(view: GameViewData | null): Reveal | null {
  const shown = useRef<Question | null>(view?.challenge?.question ?? null);
  const seen = useRef(view?.log.length ?? 0);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  useEffect(() => {
    if (!view) return;
    const fresh = view.log.slice(seen.current);
    seen.current = view.log.length;
    const result = [...fresh]
      .reverse()
      .find((e): e is ResultEvent => e.type === 'CHALLENGE_RESULT');
    const before = shown.current;
    if (result && before && before.id === result.questionId)
      setReveal({ question: before, result });
    shown.current = view.challenge?.question ?? null;
  }, [view]);

  useEffect(() => {
    if (!reveal) return;
    const id = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(id);
  }, [reveal]);

  return reveal;
}

/**
 * Who submitted for each side (from CHALLENGE_ANSWERED events): on the current question, or,
 * while a result is revealed, on the question that result belongs to.
 */
function submitters(
  log: readonly GameEvent[],
  revealing: boolean,
): Partial<Record<Side, PlayerId>> {
  const out: Partial<Record<Side, PlayerId>> = {};
  let skip = revealing;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.type === 'CHALLENGE_RESULT' && skip) {
      skip = false;
      continue;
    }
    if (skip) continue;
    if (e.type === 'CHALLENGE_RESULT' || e.type === 'CHALLENGE_STARTED') break;
    if (e.type === 'CHALLENGE_ANSWERED') out[e.side] ??= e.player;
  }
  return out;
}

function SidePanel({
  side,
  mode,
  room,
  points,
  answered,
  by,
}: {
  side: Side;
  mode: Mode;
  room: Room;
  points: number;
  answered: boolean;
  by: PlayerId | undefined;
}) {
  const seats = (Object.keys(room.seats) as PlayerId[]).filter((p) => sideOf(mode, p) === side);
  const t = en.challenge;
  return (
    <aside className={`ch-side panel panel--${side === 'BLUE' ? 'blue' : 'red'}`}>
      <h3>{side === 'BLUE' ? en.game.blueTeam : en.game.redTeam}</h3>
      <span className="ch-side__points">{points}</span>
      <span className="caption">{t.points}</span>
      <ul>
        {seats.map((p) => (
          <li key={p}>
            <b>{p}</b> {room.seats[p]?.name}
          </li>
        ))}
      </ul>
      <p
        className={`ch-side__status${answered ? ' is-done' : ''}`}
        data-testid={`challenge-status-${side}`}
      >
        {answered ? t.submitted(by ?? side) : t.answering}
      </p>
    </aside>
  );
}

/** ui-spec §9 Quantum Challenge overlay. Questions arrive one at a time from the server. */
export function ChallengeOverlay({
  view,
  room,
  reveal,
}: {
  view: GameViewData;
  room: Room;
  reveal: Reveal | null;
}) {
  const t = en.challenge;
  const ch = view.challenge;
  const mode = view.config.mode;
  const you = view.viewer === 'SPECTATOR' ? null : view.viewer;
  const mySide = you ? sideOf(mode, you) : null;
  const [picked, setPicked] = useState<{ id: string; choice: number } | null>(null);

  const question = reveal?.question ?? ch?.question;
  if (!question) return null;
  const index = reveal
    ? ch
      ? ch.index - 1
      : view.log.filter((e) => e.type === 'CHALLENGE_RESULT').length - 1
    : ch!.index;
  const total = view.config.challengeQuestions;
  const sudden = index >= total;
  // While revealing, both sides have answered the question on screen.
  const answered = reveal ? { BLUE: true, RED: true } : (ch?.answered ?? { BLUE: true, RED: true });
  const sideChoice = reveal
    ? undefined
    : (ch?.sideChoice ?? (picked?.id === question.id ? picked.choice : undefined));
  const myDone = mySide ? answered[mySide] && !reveal : true;
  const by = submitters(view.log, !!reveal);
  // After the last question the view has no challenge any more; the log still has every result.
  const scores = ch?.scores ?? matchStats(view.log).challenge ?? { BLUE: 0, RED: 0 };
  const timeUp = view.log.some((e) => e.type === 'TIME_UP');

  const choose = (i: number) => {
    if (!mySide || reveal || answered[mySide]) return;
    setPicked({ id: question.id, choice: i });
    send({ type: 'CHALLENGE_ANSWER', questionId: question.id, choice: i });
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.title}>
      <div className="ch">
        <header className="ch__head">
          <h2 className="ch__title">{t.title}</h2>
          <p className="ch__reason">
            {t.reason(timeUp ? t.timeUp : t.noCards, view.score.BLUE, view.score.RED, total)}
          </p>
          <ol className="ch__dots" aria-label={t.progress}>
            {Array.from({ length: total }, (_, i) => (
              <li
                key={i}
                className={i < index ? 'is-done' : i === index ? 'is-current' : ''}
                aria-current={i === index ? 'step' : undefined}
              />
            ))}
            {sudden && <li className="ch__sudden">{t.suddenDeath}</li>}
          </ol>
        </header>

        <SidePanel
          side="BLUE"
          mode={mode}
          room={room}
          points={scores.BLUE}
          answered={answered.BLUE}
          by={by.BLUE}
        />

        <section className="ch__card panel panel--gold">
          <span className="caption">{sudden ? t.suddenDeath : t.questionOf(index + 1, total)}</span>
          <p className="ch__prompt">{question.prompt}</p>
          <div className="ch__choices">
            {question.choices.map((text, i) => {
              const correct = reveal && reveal.result.correctChoice === i;
              const mine = sideChoice === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={`ch__choice${mine ? ' is-mine' : ''}${correct ? ' is-correct' : ''}`}
                  data-testid={`challenge-option-${i}`}
                  disabled={!mySide || !!reveal || myDone}
                  onClick={() => choose(i)}
                >
                  <span className="ch__letter">{LETTERS[i]}</span>
                  <span className="ch__text">{text}</span>
                  {mine && <span className="pill pill--gold">{t.yourAnswer}</span>}
                </button>
              );
            })}
          </div>
          {reveal ? (
            <p className="ch__explain" data-testid="challenge-explanation">
              <b>
                {t.correctIs(LETTERS[reveal.result.correctChoice]!)} ·{' '}
                {reveal.result.correct.BLUE ? '✓' : '✗'} {en.game.blue} ·{' '}
                {reveal.result.correct.RED ? '✓' : '✗'} {en.game.red}
              </b>
              <br />
              {reveal.result.explanation}
            </p>
          ) : (
            !mySide && <p className="caption">{t.watching}</p>
          )}
        </section>

        <SidePanel
          side="RED"
          mode={mode}
          room={room}
          points={scores.RED}
          answered={answered.RED}
          by={by.RED}
        />

        <footer className="ch__foot caption">
          {mode === 'TEAM' && <span>{t.teamNote}</span>}
          <span>{t.scoring}</span>
        </footer>
      </div>
    </div>
  );
}
