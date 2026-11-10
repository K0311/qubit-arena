# Qubit Arena — System Architecture

> Game rules live in [rules.md](rules.md). This file describes how the software is built.

## 1. Principles

1. **Server-authoritative.** Clients send *intents* only ("play card 17"). The server validates, applies the rules, draws every random number and runs every clock.
2. **One rules engine, shared.** `packages/engine` is pure TypeScript with no I/O, no timers and no global state. The server uses it to decide; the client uses the same code only for **move previews** and animations.
3. **Deterministic and testable.** Every rule is a pure function `(state, action, rng) → newState + events`. The RNG is passed in, so tests can use a fixed seed.
4. **Filtered views.** The server never sends the full state. Each connection receives a view built for that player (see rules.md §9).
5. **MVP first.** Build the parts in this order: engine → game flow → server → client → 3D and tutorial → accounts and ranking.

## 2. Repository layout (monorepo, pnpm workspaces)

```
qubit-arena/
├─ CLAUDE.md
├─ README.md
├─ docs/
│  ├─ rules.md            # game rules (source of truth)
│  ├─ architecture.md     # this file
│  ├─ test-plan.md        # what we test and how
│  ├─ project-overview.md # goals, scope, schedule, roles, risks
│  └─ claude-code-prompts.md
├─ packages/
│  ├─ engine/             # quantum math + game rules (pure TS)
│  └─ protocol/           # message types + zod schemas shared by server and client
├─ apps/
│  ├─ server/             # Node.js + WebSocket game server
│  └─ client/             # React + Vite + three.js web client
├─ e2e/                   # Playwright end-to-end tests
├─ docker-compose.yml     # postgres, redis, server, client
└─ .github/workflows/ci.yml
```

## 3. Technology

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) everywhere | `"strict": true`, no `any` in engine and protocol |
| Package manager | pnpm workspaces | |
| Rules engine | Pure TS, own small complex-number + matrix code | No heavy math library needed (4×4 at most) |
| Protocol | zod schemas | Every incoming message is validated |
| Server | Node.js 22.12+ (CI uses 24 LTS), `ws` WebSocket library | One process holds live rooms in memory; Redis later |
| Client | React 18 + Vite, Zustand for state | |
| 3D | three.js through @react-three/fiber + drei | Start with a 2D SVG board, switch to 3D in round 5 |
| Database | PostgreSQL + Prisma | Accounts, match history, ranking (round 6) |
| Cache | Redis | Live room state for restart/scale (round 6, optional) |
| Unit tests | Vitest | |
| E2E tests | Playwright | 2–4 browser contexts play a full game |
| Deploy | Docker Compose + GitHub Actions CI | Client can also be hosted as a static site |

## 4. Rules engine (`packages/engine`)

### 4.1 Modules

| File | Responsibility |
|---|---|
| `complex.ts` | Complex numbers: add, mul, conj, abs, approxEqual |
| `matrix.ts` | 2×2 and 4×4 matrices, kron, apply to vector |
| `gates.ts` | H, S, X, Y, Z, SX, I matrices; CNOT 4×4; `GATE_TABLE` generated from matrices |
| `states.ts` | Six positions, Bloch vectors, `positionOf(state)` → position or `FOG` |
| `quantum.ts` | Two-qubit state, apply I⊗G, apply CNOT, measure football (with injected RNG), reduced Bloch vectors |
| `deck.ts` | Deck config, build, shuffle (seeded), deal, draw |
| `game.ts` | `createGame(config, rng)`, `applyAction(state, action, rng)` → `{state, events}` |
| `rules/turn.ts` | Turn order, legal actions, timeout action |
| `rules/score.ts` | Touchdown check, game-end check |
| `challenge.ts` | Quantum Challenge question bank and scoring |
| `bot.ts` | Random-legal bot (v1), greedy bot (later) |
| `view.ts` | `viewFor(state, playerId)` → filtered view |
| `rng.ts` | Seeded PRNG (e.g. mulberry32) with an interface `{ next(): number }` |

### 4.2 Core types (sketch)

```ts
type Position = 'ZERO' | 'PLUS' | 'MINUS_I' | 'ONE' | 'MINUS' | 'PLUS_I';
type BallPosition = Position | 'FOG';
type Card = { id: number; kind: 'H'|'S'|'X'|'Y'|'Z'|'SX'|'I'|'MEASURE'|'CNOT' };
type Side = 'BLUE' | 'RED';
type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';

interface GameState {
  config: GameConfig;              // mode, targetScore, timeLimitMs, turnTimerMs, deckCounts
  phase: 'LOBBY' | 'KICKOFF' | 'PLAYING' | 'CHALLENGE' | 'FINISHED';
  qubits: Complex[];               // 4 amplitudes |p f>
  hands: Record<PlayerId, Card[]>;
  deck: Card[];                    // server only
  discard: Card[];
  turn: PlayerId;
  score: Record<Side, number>;
  log: GameEvent[];
  endReason?: 'TARGET' | 'TIME' | 'NO_CARDS' | 'CHALLENGE' | 'DRAW';
}

type Action =
  | { type: 'PLAY_CARD'; player: PlayerId; cardId: number }
  | { type: 'TIMEOUT'; player: PlayerId }
  | { type: 'CHALLENGE_ANSWER'; player: PlayerId; questionId: string; choice: number };
```

### 4.3 Invariants (checked after every action in tests and debug builds)

* Total cards (deck + hands + discard) = deck size from config.
* No hand has more than 4 cards.
* Two-qubit state is normalised (|ψ|² = 1 ± 1e-9).
* Football is one of the six positions or FOG (Clifford invariant).
* Score never decreases; only the current player's side can score.

## 5. Protocol (`packages/protocol`)

All messages are JSON with a `type` field and are validated with zod on both sides.

**Client → server:** `CREATE_ROOM`, `JOIN_ROOM`, `QUICK_MATCH`, `TAKE_SEAT`, `ADD_BOT`, `START_GAME`, `PLAY_CARD`, `CHAT`, `CHALLENGE_ANSWER`, `LEAVE`, `PING`.

**Server → client:** `ROOM_STATE` (lobby), `GAME_VIEW` (filtered state), `EVENT` (card played, touchdown, kickoff, measure result, timeout, game over), `CHAT`, `ERROR`, `PONG`.

Rules:
* `GAME_VIEW` is built per player with `viewFor()`; never broadcast one object to all.
* Every message from the client carries no trusted data other than the intent and ids.
* Include a `stateVersion` number so clients can ignore stale messages.

## 6. Server (`apps/server`)

| Part | Responsibility |
|---|---|
| Connection layer | WebSocket connections, session token, heartbeat (PING/PONG), reconnection by token |
| Lobby | Public/private rooms, join codes, quick match queue, seats and teams, spectators |
| Room / match manager | Owns one `GameState`, runs `applyAction`, broadcasts filtered views |
| Clocks | Game time limit and per-turn timer (server timers); on timeout → `TIMEOUT` action |
| Randomness | One seeded RNG per match, seed from `crypto.randomBytes`, never sent |
| Bot seats | Plays for disconnected players after the delay in rules.md §10 |
| Chat | Team-only chat channel; basic length limit and rate limit |
| Persistence (round 6) | Save finished matches and ratings to PostgreSQL |

## 7. Client (`apps/client`)

> The full UI specification (every screen, positions, colours, card text, animation, test ids) is in [ui-spec.md](ui-spec.md). This section is only a summary.

### 7.1 Screens

1. **Main menu** and **mode select** — Play (Solo 1v1 / Team 2v2), Tutorial, Settings, About.
2. **Lobby** and **room** — create/join room, choose seat and team, set target score, time, turn timer.
3. **Game** — board, hand, team panels, state panel, action log, team chat.
4. **Quantum Challenge** — tie-breaker questions.
5. **Result** — winner, final score, end reason, play again.
6. **Tutorial** — guided lessons against a bot.
7. **Settings** and **About / card library**.

### 7.2 Game screen layout

* Center: circular board with six positions, lines/arrows from `GATE_TABLE`, the football, Bloch sphere above the center.
* Bottom: the player's 4 cards; hovering/selecting a card **previews** the destination (computed with the shared engine on the current public state).
* Sides: Blue and Red team panels (players, card counts, score), turn timer.
* Right: quantum state panel — amplitudes, probabilities, global phase, partner qubit Bloch sphere, fog indicator.
* Bottom right: action log and team chat.
* Theme: dark space background; Blue `#1f5bd6`, Red `#c8323f`, accent cyan `#27e5f7`.
* **Board, 3D scene, animations and camera:** [visual-design.md](visual-design.md), taken from the Blender prototype in `reference/blender/`.
* **Screens, HUD panels, gate cards and overlays:** [ui-spec.md](ui-spec.md) (tokens in §2). If the two disagree about the board, visual-design.md wins; rules.md always wins.

### 7.3 Build order

Round 4 uses a simple **2D SVG board** so the game is playable early. Round 5 replaces it with the **3D board** (three.js) without changing game logic.

## 8. Data (round 6)

| Table | Fields (sketch) |
|---|---|
| `users` | id, displayName, passwordHash or OAuth id, createdAt |
| `matches` | id, mode, startedAt, endedAt, endReason, blueScore, redScore |
| `match_players` | matchId, userId, seat, side |
| `ratings` | userId, mode, rating, gamesPlayed |

## 9. Testing and deployment

* Unit tests (Vitest) for engine and protocol; integration tests for server rooms; Playwright E2E for full games — see [test-plan.md](test-plan.md).
* GitHub Actions: install → lint → typecheck → unit tests → build → E2E (on PRs to `main`).
* `docker-compose.yml` runs postgres, redis, server and client for local dev and the demo server.
* The game server needs a host that keeps a long-running WebSocket process (a VM, the faculty server, or a container platform). The static client can be hosted separately.

## 10. Security checklist

* Never send deck order, seed, opponents' cards or future quiz questions to any client.
* Validate every client message with zod; reject actions from the wrong player or out of turn.
* Rate-limit chat and actions per connection.
* Escape chat text in the UI.
* Secrets (DB password, session secret) only in environment variables, never in git.
