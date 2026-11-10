# CLAUDE.md — Qubit Arena

Qubit Arena is an online, multiplayer, educational quantum strategy game based on Thomas G. Wong's *Qubit Touchdown*.
Players play quantum gate cards (H, X, Y, Z, S, √X, I, Measure, CNOT) to move a football between six qubit states.
Senior project, Faculty of ICT, Mahidol University (Aug 2026 – Apr 2027).

## Read first
- **docs/rules.md** — every game rule. It is the source of truth. If code and rules.md disagree, the code is wrong.
- **docs/architecture.md** — monorepo layout, tech stack, protocol, server-authoritative design.
- **docs/ui-spec.md** — every screen: layout, colours, card text, animation, test ids. Client work follows it. Images in `docs/design/` are mood references only; they contain rule errors (see ui-spec §15).
- **docs/test-plan.md** — test IDs and pass criteria. Name tests after these IDs (e.g. `T-G-01`, `T-C-03`).
- **docs/project-overview.md** — goals, scope (MVP), schedule, roles, risks.
- **docs/roadmap.md** — every task until the project ends, as checkboxes. `/next` does the next task; `/status` reports progress.
- **docs/claude-code-prompts.md** — the prompt for each task ID (P-0.1 … P-9.3).
- **docs/user-study.md** — learning check, survey and procedure for the user study.

## Golden rules
1. **Do not change game rules on your own.** If a rule is unclear or an item is marked [OPEN] in rules.md, use the default written there and tell me; never invent a new rule.
2. **Server-authoritative.** The client sends intents only. Deck order, RNG seed and opponents' cards must never be sent to a client.
3. **`packages/engine` is pure.** No I/O, no `Date.now()`, no `Math.random()`, no timers, no imports from apps. Randomness comes from an injected `Rng`.
4. **Tests first.** For any rule or engine change, write or update the test first, watch it fail, then implement.
5. **Gate results come from matrices.** Never hard-code moves in game logic; the expected table lives only in tests.
6. **Small steps.** One feature per change. Keep the build green. Do not rewrite unrelated code.
7. **MVP first.** Order: engine → game flow → server → client (2D) → 3D + tutorial → accounts/ranking → sound (optional).

## Tech stack
TypeScript (strict) · pnpm workspaces · Vitest · zod · Node.js + `ws` · React + Vite + Zustand · three.js (@react-three/fiber) · PostgreSQL + Prisma (later) · Redis (optional) · Playwright · Docker Compose · GitHub Actions.

## Layout
```
packages/engine     quantum math + rules (pure)
packages/protocol   message types + zod schemas
apps/server         WebSocket game server
apps/client         React web client
e2e/                Playwright tests
docs/               specs
```

## Commands
```
pnpm install
pnpm test                      # all unit tests
pnpm --filter @qa/engine test  # engine only
pnpm typecheck
pnpm lint
pnpm dev                       # server + client
pnpm e2e                       # Playwright
```
(Update this list if you add or rename scripts.)

## Code style
- TypeScript strict, no `any` in engine/protocol. Prefer `type` unions over enums.
- Pure functions returning new objects; no mutation of input state in the engine.
- Complex-number comparisons use a tolerance of 1e-9.
- File and folder names in kebab-case; types in PascalCase; functions in camelCase.
- Comments in English. Explain *why*, not *what*.

## Git workflow
- `main` is protected. Work on branches: `feat/engine-…`, `feat/server-…`, `feat/client-…`, `fix/…`, `docs/…`.
- Conventional commits: `feat(engine): add CNOT fog rule`, `test(engine): T-C-01..05`.
- Open a PR; CI must pass; one teammate reviews.

## When you finish a task
- Run `pnpm test` and `pnpm typecheck` and report the results.
- List anything you assumed or left as TODO.
- If you touched rules or protocol, say which section of the docs it follows.
