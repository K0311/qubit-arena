import { useEffect, useRef, useState } from 'react';
import type { Side } from '@qa/engine';
import { en } from '../../i18n/en';
import { send } from '../../net/connection';
import { useGame } from '../../state/store';

/**
 * Team chat (ui-spec §7.1, rules.md §9). The server sends each line only to the sender's team,
 * so this panel never holds the other team's messages.
 */
export function TeamChat({ side }: { side: Side }) {
  const chat = useGame((s) => s.chat);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send({ type: 'CHAT', text });
    setDraft('');
  };

  return (
    <section
      className={`game-chat panel panel--${side === 'BLUE' ? 'blue' : 'red'}`}
      data-testid="team-chat"
    >
      <h2 className="panel__title">{en.game.teamChat(side)}</h2>
      <ol className="chat" ref={list}>
        {chat.length === 0 && <li className="muted">{en.chat.empty}</li>}
        {chat.map((m, i) => (
          <li key={`${m.at}-${i}`} className="chat__line">
            <b title={m.name}>{m.from}</b> <span>{m.text}</span>
          </li>
        ))}
      </ol>
      <form className="chat__form" onSubmit={submit}>
        <input
          aria-label={en.chat.placeholder}
          placeholder={en.chat.placeholder}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="team-chat-input"
        />
        <button type="submit" className="chat__send" disabled={!draft.trim()}>
          {en.chat.send}
        </button>
      </form>
    </section>
  );
}
