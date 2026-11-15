import { useEffect, useState } from 'react';

/** Re-renders every `ms` and returns performance.now(), for the local clock countdown. */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
