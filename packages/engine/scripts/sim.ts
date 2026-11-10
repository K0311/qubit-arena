// Long bot-vs-bot simulation (test-plan.md §3.6, SE-5): `pnpm sim [games] [baseSeed]`.
// Splits games evenly between Solo and Team and stops at the first failure, printing its seed.
import { simulateGame } from '../test/sim/simulate';

const games = Number(process.argv[2] ?? 10_000);
const base = Number(process.argv[3] ?? Math.floor(Math.random() * 1e9));
const started = Date.now();
const reasons: Record<string, number> = {};
let actions = 0;

try {
  for (let i = 0; i < games; i++) {
    const r = simulateGame(base + i, i % 2 === 0 ? 'SOLO' : 'TEAM');
    actions += r.actions;
    const reason = r.final.endReason ?? 'none';
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
} catch (e) {
  console.error(String(e));
  console.error(`base seed ${base}; replay with: pnpm sim ${games} ${base}`);
  process.exit(1);
}

console.log(
  `${games} games OK in ${((Date.now() - started) / 1000).toFixed(1)} s (base seed ${base})`,
);
console.log(
  `avg actions per game: ${(actions / games).toFixed(1)}; end reasons: ${JSON.stringify(reasons)}`,
);
