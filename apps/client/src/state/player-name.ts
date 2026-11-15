import { useCallback, useState } from 'react';

const KEY = 'qa.playerName';

function randomName(): string {
  return `Player-${Math.floor(1000 + Math.random() * 9000)}`;
}

function load(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const name = randomName();
    localStorage.setItem(KEY, name);
    return name;
  } catch {
    return randomName();
  }
}

/** Display name for CREATE_ROOM / JOIN_ROOM / QUICK_MATCH, kept in localStorage (ui-spec §12). */
export function usePlayerName(): [string, (name: string) => void] {
  const [name, setName] = useState(load);
  const save = useCallback((next: string) => {
    const clean = next.trim().slice(0, 24) || randomName();
    setName(clean);
    try {
      localStorage.setItem(KEY, clean);
    } catch {
      // Not persisted; fine for this tab.
    }
  }, []);
  return [name, save];
}
