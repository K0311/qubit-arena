/**
 * T-S-03 for the client bundle (rules.md §9): the built client must not contain the quiz bank.
 * The client imports @qa/engine for previews; without tree-shaking the whole question bank,
 * with its answers, would ship to every browser.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTION_BANK } from '@qa/engine';

const dir = join(import.meta.dirname, '..', 'dist', 'assets');
const code = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

const leaks = QUESTION_BANK.flatMap((q) =>
  [q.id, q.prompt].filter((s) => code.includes(s)).map((s) => `${q.id}: "${s.slice(0, 40)}"`),
);
if (leaks.length > 0) {
  console.error(`Client bundle contains ${leaks.length} quiz strings (rules.md §9):`);
  for (const l of leaks.slice(0, 10)) console.error(`  ${l}`);
  process.exit(1);
}
console.log(`Client bundle checked: no quiz questions (${QUESTION_BANK.length} in the bank).`);
