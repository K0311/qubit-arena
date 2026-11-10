import { describe, expect, it } from 'vitest';
import { simulateGame } from './simulate';

// Random base seed per run (printed on failure inside simulateGame) so CI keeps exploring;
// set SIM_SEED to replay a run exactly.
// (The engine has no Node types, so read the env through globalThis.)
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const base = Number(env?.SIM_SEED ?? Math.floor(Math.random() * 1e9));

describe('simulation (SE-5, test-plan.md §3.6)', () => {
  it.each(['SOLO', 'TEAM'] as const)('250 %s bot games finish with invariants intact', (mode) => {
    const reasons = new Set<string>();
    for (let i = 0; i < 250; i++) {
      const { final } = simulateGame(base + i, mode);
      expect(final.phase).toBe('FINISHED');
      reasons.add(final.endReason ?? 'none');
    }
    // Sanity: the simulation reaches more than one way of ending.
    expect(reasons.size).toBeGreaterThan(1);
  });
});
