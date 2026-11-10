# ชุดคำสั่ง Claude Code สำหรับสร้าง Qubit Arena

ไฟล์นี้รวม prompt ที่ใช้สั่ง Claude Code ทีละขั้น ตั้งแต่ตั้งโปรเจกต์จนถึง deploy
แต่ละขั้นมี **prompt (ภาษาอังกฤษ ก๊อปไปวางได้เลย)**, **ถือว่าเสร็จเมื่อ** และ **ใครรับผิดชอบ**

## วิธีใช้

1. เปิด terminal ในโฟลเดอร์ repo แล้วรัน `claude`
2. Claude Code จะอ่าน `CLAUDE.md` เองทุกครั้ง ไม่ต้องแปะกฎซ้ำ
3. **ทำทีละขั้น** ห้ามข้ามขั้น ให้ test ของขั้นนั้นผ่านก่อนแล้วค่อยไปขั้นถัดไป
4. งานใหญ่ให้วางแผนก่อน โดยขึ้นต้น prompt ว่า `Plan first, don't write code yet.` อ่านแผนให้โอเค แล้วค่อยพิมพ์ `Go ahead.`
5. จบแต่ละขั้นให้ commit และเปิด PR โดยใช้ prompt **P-GIT** ด้านล่าง
6. ถ้าผลเกตผิด ห้ามอธิบายเองว่าควรเป็นอะไร ให้บอกว่า `Check against the table in docs/rules.md §3.2.`

### Plugin ที่แนะนำ (ติดตั้งไว้แล้ว)
- **playwright** ให้ Claude เปิดเบราว์เซอร์ทดลองเล่นและถ่ายภาพหน้าจอ
- **E2E Test Generator** ช่วยเขียน Playwright test จากหน้าจริง
- **codex-review** ส่งแผนหรือโค้ดไปให้ Codex รีวิวอีกชั้น (ต้องมี Codex CLI)
- **Vercel** สำหรับ deploy เฉพาะฝั่ง client (ตัว game server ใช้ WebSocket ต่อเนื่อง ต้อง deploy บนเครื่องที่รัน process ค้างไว้ได้)

---

## ขั้น 0 — ตั้งโครง monorepo (ทุกคน, ครั้งเดียว)

**P-0.1 Scaffold**
```
Read CLAUDE.md and docs/architecture.md. Plan first, don't write code yet.
Then scaffold the pnpm monorepo exactly as in architecture.md §2:
packages/engine (@qa/engine), packages/protocol (@qa/protocol), apps/server (@qa/server), apps/client (@qa/client, Vite + React + TS), e2e/.
Set up TypeScript strict with a shared tsconfig.base.json, ESLint + Prettier, Vitest in every package, and root scripts: test, typecheck, lint, dev, e2e.
Add one placeholder test per package so `pnpm test` passes. Do not implement any game logic yet.
```
**P-0.2 CI**
```
Add .github/workflows/ci.yml: on push and pull_request run pnpm install, lint, typecheck, test, build. Use pnpm caching. Node 20.
```
**เสร็จเมื่อ:** `pnpm install && pnpm test && pnpm typecheck` ผ่าน และ CI บน GitHub ขึ้นสีเขียว

---

## รอบ 1 — Rules engine: คณิตควอนตัม (คนทำ engine)

**P-1.1 Complex numbers and matrices**
```
In packages/engine implement complex.ts and matrix.ts as described in docs/architecture.md §4.1:
complex add/mul/conj/abs/approxEqual (tolerance 1e-9), 2x2 and 4x4 matrix multiply, kron, apply to vector.
Write unit tests first. Pure functions only.
```
**P-1.2 Gates and the 42 gate tests**
```
Implement gates.ts and states.ts following docs/rules.md §2 and §3.
- The six positions with the identifiers from rules.md §2.1 and their amplitudes.
- positionOf(state) compares by |<a|b>| ≈ 1 (ignore global phase).
- Matrices for H, S, X, Y, Z, SX, I.
Tests first: write T-G-01..T-G-46 from docs/test-plan.md §3.1. The expected 42 results must be typed in the test from rules.md §3.2, not computed.
Then implement until all tests pass.
```
**P-1.3 Two-qubit state, CNOT, Measure, fog**
```
Implement quantum.ts following docs/rules.md §4: a 4-amplitude state |p f> (partner first, football second), apply I⊗G, CNOT (control partner, target football), measureFootball(state, rng), reduced Bloch vectors for both qubits, and ballPosition(state) returning a position or 'FOG'.
Tests first: T-C-01..T-C-10 from docs/test-plan.md §3.2. Use a seeded Rng from rng.ts (mulberry32) for measurement tests.
```
**P-1.4 Board lines generator**
```
Add boardLines() that builds the two-way lines and one-way arrows from the gate matrices (rules.md §2.4). The client will draw the board from this. Test T-G-46.
```
**เสร็จเมื่อ:** test ของ T-G ทั้ง 46 ข้อและ T-C ทั้ง 10 ข้อผ่านหมด, coverage ของ engine ≥ 90 %

---

## รอบ 2 — Rules engine: ตัวเกม (คนทำ engine)

**P-2.1 Deck and setup**
```
Implement deck.ts and createGame(config, rng) following docs/rules.md §3.5 and §5:
default 55-card deck with configurable counts, seeded shuffle, deal 4 cards, Solo and Team seats and sides, opening roll in both modes (higher roll plays first, tie re-rolls), kickoff with the ball at ZERO or ONE and the partner reset to |+>, after a touchdown the scorer kicks off and the other side plays first. Defaults: target 7, 15 minutes for both modes.
Tests first: T-R-01..T-R-04b and T-R-24.
```
**P-2.2 Turns, scoring and game end**
```
Implement applyAction(state, action, rng) for PLAY_CARD and TIMEOUT following docs/rules.md §6, §7 and §8:
turn order (Solo P1→P2, Team P1→P3→P2→P4), no passing, discard and draw back to 4, touchdown only when moving INTO your own end zone on your turn, no score in the opponent zone or in FOG, failed punt, scorer kicks off, end by target / time / no cards, tie → CHALLENGE phase.
Return {state, events}. Never mutate the input state.
Tests first: T-R-05..T-R-19 and T-R-23.
```
**P-2.3 Quantum Challenge**
```
Implement challenge.ts following rules.md §8.1: a question bank of at least 20 multiple-choice questions about the six states, the gates in rules.md §3.2 and measurement; 5 random questions; scoring; sudden death on/off; draw.
Tests: T-R-20..T-R-22.
```
**P-2.4 Filtered view, bot and simulation**
```
Implement view.ts viewFor(state, playerId | 'SPECTATOR') following rules.md §9, and bot.ts (random legal card).
Add a simulation test (docs/test-plan.md §3.6): 500 bot-vs-bot games (Solo and Team) with random seeds, check the invariants in docs/architecture.md §4.3 after every action, cap 2,000 turns, print the seed on failure.
Add a separate `pnpm sim` script that runs 10,000 games.
```
**เสร็จเมื่อ:** test ทั้งหมดในหมวด T-R ผ่าน, simulation 10,000 เกมไม่มี invariant พัง และไม่มีเกมค้าง

> 💡 ถ้ามีโค้ดจากต้นแบบ Blender ให้ใส่ไว้ใน `reference/blender/` แล้วเพิ่มบรรทัดนี้ใน prompt: `Use reference/blender/ as the reference implementation; port its logic, do not copy Blender-specific code.`

---

## รอบ 3 — Protocol และ Game server (คนทำ server)

**P-3.1 Protocol**
```
Implement packages/protocol from docs/architecture.md §5: zod schemas and TS types for every client→server and server→client message, with a stateVersion field. Export parse helpers. Unit tests for valid and invalid messages.
```
**P-3.2 Server core**
```
Plan first. Then implement apps/server with the `ws` library following docs/architecture.md §6:
connections with a session token, heartbeat, lobby (public/private rooms with join code, quick match), seats and teams, start game, PLAY_CARD handling through @qa/engine, per-player GAME_VIEW using viewFor, EVENT broadcasts, team-only CHAT, spectators.
One seeded RNG per match from crypto.randomBytes; the seed never leaves the server.
Tests first: integration tests T-S-01..T-S-05 and T-S-08 on a random port.
```
**P-3.3 Clocks, reconnection, bot seats**
```
Add the game time limit and the 60 s turn timer on the server (TIMEOUT action), reconnection by token, and a bot that takes over a disconnected seat after the delay in rules.md §10. Add chat and action rate limits.
Tests: T-S-06, T-S-07, T-S-09.
```
**P-3.4 Hidden data audit**
```
Write T-S-03: wrap the server's send function in tests and assert that no outgoing message ever contains the deck, the seed, or the card kinds of opponents. Run it over 50 simulated online games.
```
**เสร็จเมื่อ:** test ทั้งหมดในหมวด T-S ผ่าน และเปิด 2 terminal (หรือ 2 แท็บที่ใช้ client ชั่วคราว) เล่นกันได้

---

## รอบ 4 — Web client แบบ 2D (คนทำ client)

**P-4.1 App shell and connection**
```
Plan first. In apps/client build the screens from docs/architecture.md §7.1 with React Router: main menu, lobby, game, challenge, result. Add a WebSocket client with reconnection and a Zustand store fed only by server messages (GAME_VIEW, EVENT). Dark space theme with the colors in architecture.md §7.2.
```
**P-4.2 2D board and hand**
```
Build the game screen with a 2D SVG board: six positions on a circle in the order of rules.md §2.1, lines and arrows from boardLines(), end zones colored Blue (|+>) and Red (|->), the football or a fog effect.
Show the player's 4 cards; selecting a card previews the destination using @qa/engine on the public state; Play Card sends PLAY_CARD. Show the turn timer, both team panels with card counts and score, and the action log.
```
**P-4.3 State panel and team chat**
```
Add the quantum state panel: amplitudes, probabilities, global phase, a simple 2D Bloch sphere view for the football and the partner, and a fog indicator. Add team chat (Team mode only).
```
**P-4.4 Playwright**
```
Using the e2e-test-generator approach, write Playwright tests T-E-01..T-E-05 from docs/test-plan.md §3.5. Use TEST_SEED and TEST_DECK (server only accepts them when NODE_ENV=test) so games are short and deterministic.
```
**เสร็จเมื่อ:** เล่น Solo กับ Team ได้ครบตั้งแต่เริ่มจนจบผ่านเบราว์เซอร์ และ test ในหมวด T-E-01..05 ผ่าน

> 💡 ใช้ playwright plugin ให้ Claude ลองเล่นจริงได้: `Open the app with Playwright, play one Solo game in two tabs and send me screenshots of anything that looks wrong.`

---

## รอบ 5 — 3D, animation, tutorial (คนทำ client)

**P-5.1 3D board**
```
Replace the 2D board with a three.js board using @react-three/fiber and drei, keeping the same props and game logic: circular board, six glowing nodes, lines/arrows, Blue and Red end zones, the football as a 3D ball, camera controls. Keep the 2D board as a fallback setting for slow computers.
```
**P-5.2 Bloch spheres and animation**
```
Add 3D Bloch spheres for the football (above the board center) and the partner qubit. Animate the ball moving along a line, staying in place, entering and leaving the fog, and measurement collapse.
```
**P-5.3 Tutorial**
```
Build the tutorial from docs/rules.md §11: five short lessons against the bot, each with goals and hints, using fixed decks so the lesson always works. Track completed lessons in localStorage. Add Playwright test T-E-06.
```
**เสร็จเมื่อ:** หน้าจอตรงกับ Figure 3.2 / 3.4 และทำ tutorial ได้ครบ 5 บท

---

## รอบ 6 — บัญชี ranking และ deploy (คนทำ server, ทำเมื่อมีเวลา)

**P-6.1 Database**
```
Add PostgreSQL with Prisma using the tables in docs/architecture.md §8. Simple accounts (display name + password with bcrypt, or guest). Save finished matches and update an Elo rating per mode. Add a leaderboard endpoint and page.
```
**P-6.2 Docker and deploy**
```
Add Dockerfiles for server and client and docker-compose.yml with postgres, redis, server and client. Document in README how to run the demo with one command. Keep secrets in .env (not committed) and add .env.example.
```
**P-6.3 (optional) Sound**
```
Add optional sound effects (card play, move, touchdown, measure) with a mute toggle in settings. Default volume low.
```

---

## Prompt ที่ใช้ได้ตลอด

**P-GIT — commit และเปิด PR**
```
Run pnpm lint, typecheck and test. If all pass, create a branch named feat/<area>-<short-name>, commit with a conventional commit message that lists the test IDs covered, push, and open a PR with a summary, the test results and any assumptions.
```
**P-FIX — เมื่อ test พัง**
```
This test fails: <paste error>. Find the root cause before changing code. Check against docs/rules.md. Do not weaken or delete the test. Explain the cause, then fix it.
```
**P-REVIEW — ให้รีวิวก่อน merge**
```
Review the diff of this branch against main for: rule mistakes compared with docs/rules.md, hidden data leaks to clients, mutation in the engine, missing tests from docs/test-plan.md. List problems by severity; do not change code yet.
```
(ถ้าติดตั้ง codex-review ไว้ ใช้ `/codex-review:code` ให้ Codex ช่วยรีวิวซ้ำอีกรอบได้)

**P-RULE — เจอกฎที่ไม่ชัด**
```
The rule for <situation> is not clear in docs/rules.md. Do not implement anything. Propose 2–3 options with pros and cons, and the change to rules.md for each.
```
**P-STATUS — สรุปความคืบหน้า**
```
Compare the code with docs/test-plan.md and docs/project-overview.md §6. Which test IDs exist and pass, which are missing, and what is the next most important task?
```
