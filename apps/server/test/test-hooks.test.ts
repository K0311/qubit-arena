import { afterEach, describe, expect, it } from 'vitest';
import { testHooksFromEnv } from '../src/test-hooks';
import type { RunningServer } from '../src/server';
import { closeAll, startTable, withServer, type TestClient } from './helpers';

describe('test hooks: TEST_SEED and TEST_DECK only when NODE_ENV=test (test-plan §3.5)', () => {
  it('ignores both outside NODE_ENV=test', () => {
    expect(testHooksFromEnv({ TEST_SEED: '7', TEST_DECK: 'H4,X4,CNOT8' })).toBeUndefined();
    expect(
      testHooksFromEnv({ NODE_ENV: 'production', TEST_SEED: '7', TEST_DECK: 'H16' }),
    ).toBeUndefined();
  });

  it('parses a seed and a deck like "H3,X3,CNOT2"; other cards get 0', () => {
    const hooks = testHooksFromEnv({
      NODE_ENV: 'test',
      TEST_SEED: '42',
      TEST_DECK: 'H3,X3,CNOT2,MEASURE10',
    });
    expect(hooks?.seed).toBe(42);
    expect(hooks?.deckCounts).toMatchObject({ H: 3, X: 3, CNOT: 2, MEASURE: 10, Y: 0, I: 0 });
  });

  it('accepts either one alone, and nothing at all', () => {
    expect(testHooksFromEnv({ NODE_ENV: 'test', TEST_SEED: '1' })).toEqual({ seed: 1 });
    expect(testHooksFromEnv({ NODE_ENV: 'test' })).toBeUndefined();
  });

  it('refuses bad values instead of guessing', () => {
    expect(() => testHooksFromEnv({ NODE_ENV: 'test', TEST_SEED: 'abc' })).toThrow(/TEST_SEED/);
    expect(() => testHooksFromEnv({ NODE_ENV: 'test', TEST_DECK: 'Q3' })).toThrow(/TEST_DECK/);
    expect(() => testHooksFromEnv({ NODE_ENV: 'test', TEST_DECK: 'H-1' })).toThrow(/TEST_DECK/);
  });
});

describe('the server with test hooks', () => {
  let server: RunningServer;
  const open: TestClient[] = [];
  afterEach(async () => {
    await closeAll(open.splice(0));
    await server?.close();
  });

  it('TEST_DECK replaces the deck of every game; TEST_SEED makes two games identical', async () => {
    const hooks = {
      seed: 7,
      deckCounts: testHooksFromEnv({ NODE_ENV: 'test', TEST_DECK: 'H6,X6,CNOT6' })!.deckCounts!,
    };
    server = await withServer({ testHooks: hooks });
    const first = await startTable(server.port, 'SOLO');
    open.push(...Object.values(first.clients));
    const second = await startTable(server.port, 'SOLO');
    open.push(...Object.values(second.clients));
    const v1 = (await first.host.waitFor('GAME_VIEW')).view;
    const v2 = (await second.host.waitFor('GAME_VIEW')).view;
    // 18 cards, 8 dealt.
    expect(v1.deckCount).toBe(10);
    expect(v1.hands.P1!.every((c) => ['H', 'X', 'CNOT'].includes(c.kind))).toBe(true);
    expect(v2.hands.P1).toEqual(v1.hands.P1);
    expect(v2.log).toEqual(v1.log);
  });

  it('a test deck too small for the seats is refused at start, not dealt short', async () => {
    const hooks = {
      deckCounts: testHooksFromEnv({ NODE_ENV: 'test', TEST_DECK: 'H4' })!.deckCounts!,
    };
    server = await withServer({ testHooks: hooks });
    await expect(startTable(server.port, 'SOLO')).rejects.toThrow();
  });
});
