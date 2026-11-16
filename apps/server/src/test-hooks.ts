import { CARD_KINDS, type CardKind, type DeckCounts } from '@qa/engine';

/**
 * Test hooks (test-plan §3.5): a fixed match seed and a fixed deck so end-to-end tests are short
 * and repeatable. Read only when NODE_ENV=test, so a real server can never be started with a
 * known seed (architecture.md §6: the seed never leaves the server and is never predictable).
 */
export type TestHooks = { seed?: number; deckCounts?: DeckCounts };

type Env = Readonly<Record<string, string | undefined>>;

/** "H3,X3,CNOT2" → counts for every card kind (missing kinds are 0). */
function parseDeck(text: string): DeckCounts {
  const counts = Object.fromEntries(CARD_KINDS.map((k) => [k, 0])) as Record<CardKind, number>;
  for (const part of text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^([A-Z]+?)(\d+)$/.exec(part);
    const kind = m?.[1] as CardKind | undefined;
    if (!m || !kind || !(CARD_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`TEST_DECK: "${part}" is not <card><count>, e.g. H3 or CNOT2`);
    }
    counts[kind] = Number(m[2]);
  }
  return counts;
}

export function testHooksFromEnv(env: Env): TestHooks | undefined {
  if (env.NODE_ENV !== 'test') return undefined;
  const hooks: TestHooks = {};
  if (env.TEST_SEED !== undefined && env.TEST_SEED !== '') {
    const seed = Number(env.TEST_SEED);
    if (!Number.isInteger(seed) || seed < 0)
      throw new Error(`TEST_SEED: "${env.TEST_SEED}" is not a whole number`);
    hooks.seed = seed;
  }
  if (env.TEST_DECK !== undefined && env.TEST_DECK !== '')
    hooks.deckCounts = parseDeck(env.TEST_DECK);
  return Object.keys(hooks).length > 0 ? hooks : undefined;
}
