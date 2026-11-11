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
Tests: T-S-06, T-S-07, T-S-09. In the Quantum Challenge a bot answers for its side only when that side has no connected human (rules.md §8.1, T-S-10).
```
**P-3.4 Hidden data audit**
```
Write T-S-03: wrap the server's send function in tests and assert that no outgoing message ever contains the deck, the seed, or the card kinds of opponents. Run it over 50 simulated online games.
```
**เสร็จเมื่อ:** test ทั้งหมดในหมวด T-S ผ่าน และเปิด 2 terminal (หรือ 2 แท็บที่ใช้ client ชั่วคราว) เล่นกันได้

---

## รอบ 4 — Web client แบบ 2D (คนทำ client)

> **หน้าจอ แผง HUD การ์ด และ overlay** ทำตาม [`docs/ui-spec.md`](ui-spec.md) (ภาพ reference อยู่ใน [`docs/design/`](design/))
> **ตัวกระดาน ฉาก 3D animation และกล้อง** ทำตาม [`docs/visual-design.md`](visual-design.md) (แบบ Blender)
> ภาพ reference มีเนื้อหาเกมที่ผิดกฎหลายจุด (ดู ui-spec §15) ห้ามลอกเนื้อหาเกมจากภาพ และถ้าเอกสารใดขัดกับ rules.md ให้เชื่อ rules.md

**P-4.1 App shell, theme and connection**
```
Plan first. Read docs/ui-spec.md §1–§3 and docs/architecture.md §7.
In apps/client:
- Design tokens from ui-spec §2 in src/theme/tokens.ts and as CSS variables (colours, gate colours, type styles, spacing). Self-host Orbitron, Exo 2 and JetBrains Mono with @fontsource. All kets use JetBrains Mono and the real minus sign.
- Space background (gradient + star layer) as a component; do not use the PNGs in docs/design/.
- Shared UI components: Panel, Button (Primary/Secondary/Danger), Pill, PlayerChip (team, seat, name, card count, active), Toggle, Stepper, Modal/Overlay, Toast.
- React Router with every route in ui-spec §3. Build Main menu and Mode select (§4), Lobby (§5) and Room (§6) fully; other routes may be placeholders for now.
- WebSocket client with reconnection and a Zustand store fed only by server messages (ROOM_STATE, GAME_VIEW, EVENT, CHAT). The client never stores deck, seed or opponents' cards.
- Put all UI strings in src/i18n/en.ts. Add the data-testid values from ui-spec §14 for these screens.
Component tests with Vitest + Testing Library for PlayerChip, Button and the Room settings defaults (target 7, 15:00, 60 s).
```
**P-4.2 Game screen: 2D board, gate cards, hand and preview**
```
Plan first. Read docs/ui-spec.md §7–§8, docs/visual-design.md §2, §5 and §6, and docs/rules.md §2–§4.
- Game screen layout as ui-spec §7.1 (Team and Solo variants, spectator view), scaling from 1920×1080 down to 1280×720.
- 2D SVG board following visual-design.md (2D top view): six positions placed with boardPoint(), rotated so the viewer's own end zone is at the top (Blue: |+> up, Red: |-> up, spectators see Blue's view), state colours from visual-design §2, the 13 edges from boardEdges() with their gate labels, end-zone rings and labels in the team colour, the football, and the fog effect (the ball is hidden in the fog, rules.md §4.4). Never hard-code positions or moves.
- GateCard component per ui-spec §8.1 (hand size and detail size) and a card back. Name, description and footer come from ui-spec §8.2; the "board effect" line is generated from @qa/engine (apply the gate to each of the six positions and group the results into ↔ swaps, → cycles and "stay"), never typed by hand. Add a snapshot test showing the generated lines match the §8.2 table.
- Hand: select by click or keys 1–4, Enter plays, Esc cancels. Move preview with @qa/engine on the public state (rules.md §6.1 step 2) with the banner texts in ui-spec §7.3 and visual-design §4 (touchdown, no score in the other zone, stays, measure 50/50, failed punt, CNOT and fog texts from rules.md §4.3–§4.4).
- Scoreboard, turn bar (Team P1→P3→P2→P4, Solo P1→P2), clocks with the turn timer turning red under 10 s, team panels with opponents' card counts only and the teammate's hand as gate tags (rules.md §9), deck count, PLAY CARD sends PLAY_CARD.
- Action log per ui-spec §7.5 built only from engine events.
Add the data-testid values from ui-spec §14.
```
**P-4.3 State panel, team chat, challenge and result**
```
Read docs/ui-spec.md §7.4, §9 and §10.
- Quantum state panel: two 2D Bloch spheres (football, partner), amplitudes (single-qubit or two-qubit form in the fog), P(|0>) and P(|1>) bars, global phase, fog indicator (green / purple) and the hint line.
- Team chat (Team mode only, never shown to opponents or spectators).
- Quantum Challenge overlay (§9): progress dots, question card with 2–6 choices (A–F, as many as the server sends), both sides' status and points, "first submission counts" note, correct-answer reveal. Questions arrive one by one from the server.
- Result overlay (§10): winner, score, end reason, stats, Play Again / Main Menu, and the learning-check button only when the study flag is on.
- Settings page (§12) saved in localStorage; hide the Audio group until sound exists.
```
**P-4.4 Playwright**
```
Using the e2e-test-generator approach, write Playwright tests T-E-01..T-E-05 from docs/test-plan.md §3.5. Use the data-testid values in docs/ui-spec.md §14. Use TEST_SEED and TEST_DECK (server only accepts them when NODE_ENV=test) so games are short and deterministic.
Also save screenshots of every screen in ui-spec §3 at 1920×1080 to e2e/screenshots/, compare them with docs/ui-spec.md and the images in docs/design/, and list every difference.
```
**เสร็จเมื่อ:** เล่น Solo กับ Team ได้ครบตั้งแต่เริ่มจนจบผ่านเบราว์เซอร์, test ในหมวด T-E-01..05 ผ่าน และทุกหน้าจอในรอบนี้ตรงกับ ui-spec (เทียบภาพหน้าจอกับ ui-spec และภาพใน docs/design/ แล้ว)

> 💡 ใช้ playwright plugin ให้ Claude ลองเล่นจริงได้: `Open the app with Playwright, play one Solo game in two tabs and send me screenshots of anything that looks wrong compared with docs/ui-spec.md.`

---

## รอบ 5 — 3D, animation, tutorial (คนทำ client)

**P-5.1 3D board**
```
Plan first. Read docs/visual-design.md §1–§3 and §5, and docs/ui-spec.md §7.2.
Replace the 2D board with a three.js board using @react-three/fiber and drei, keeping the same props and game logic. Follow visual-design.md (the Blender prototype's ORBIT style; reference/blender/ and docs/images/blender-*.jpg): space sky, floating dome characters with eyes, orbit swirl, gradient edges with arrows and gate labels from boardEdges(), Blue and Red end zones, the football token, the partner sphere and the fog, camera views with the goal view as default, and the minimap. Use reference/blender/ as the reference implementation; port its logic, do not copy Blender-specific code.
The images in docs/design/ are for the screens around the board, not for the board itself.
Keep the 2D board as the "Board: 2D" setting (ui-spec §12) and use it automatically when WebGL is unavailable. Keep every data-testid working in both boards.
```
**P-5.2 Bloch spheres and animation**
```
Read docs/visual-design.md §3–§4 and docs/ui-spec.md §7.4 and §13.
Add 3D Bloch spheres for the football (above the board centre) and the partner qubit; in the fog both vectors shrink to the centre and a link joins the spheres.
Implement every animation in visual-design §4 plus the extra ones in ui-spec §13, driven only by engine/server events (card played, move, stay, enter/leave fog, measure, touchdown, kickoff, opening roll). The Bloch vector rotates about each gate's axis while the ball hops. Respect "Reduce motion" and prefers-reduced-motion.
The gate-card detail view and the card library at /about use the full card design from ui-spec §8 with a small Bloch sphere showing the rotation axis.
```
**P-5.3 Tutorial**
```
Read docs/rules.md §11 and docs/ui-spec.md §11.
Build the tutorial: five short lessons against the bot in the Solo game layout, with the lesson list on the left, a coach bubble pointing at nodes and cards, a goal checklist and progress bar on the right, and fixed decks so every lesson always works. Lesson 5 must show entering the fog and leaving it by Measure and by a second CNOT.
Track completed lessons in localStorage. Add Playwright test T-E-06.
```
**เสร็จเมื่อ:** กระดานตรงกับ `docs/visual-design.md`, หน้าจอรอบกระดานตรงกับ `docs/ui-spec.md`, animation ครบตาม visual-design §4 และ ui-spec §13, ทำ tutorial ได้ครบ 5 บท และ T-E-06 ผ่าน

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

**P-6.4 Greedy bot (optional)**
```
Add a greedy bot level in packages/engine/bot.ts: for each legal card, use the engine to compute the result and prefer (1) a touchdown for its side, (2) leaving the fog when it helps, (3) moving one step closer to its own end zone, (4) moving the ball away from the opponent's end zone; break ties with the RNG. Add a setting for bot level. Test with 1,000 games: greedy must beat random in more than 60 % of games.
```

---

## รอบ 7 — Testing & Integration + user study (เฟส 7)

**P-7.0 Feature freeze checklist**
```
Compare the app with docs/project-overview.md §4 (MVP features) and docs/test-plan.md. Produce a checklist in docs/report/mvp-checklist.md: each MVP feature → implemented? where in the code? which tests cover it? Open a GitHub issue for every missing item. Do not add new features.
```
**P-7.1 Full system test run and report**
```
Run every test level in docs/test-plan.md: unit, simulation (10,000 games, Solo and Team), server integration, Playwright E2E. Write docs/report/test-report.md with a table for SE-1..SE-6 (aspect, method, numbers, pass/fail), the measurement statistics from T-C-07 and SE-3 (exact % of zeros), coverage per package, and any failures with their seeds. Commit raw outputs to docs/report/raw/.
```
**P-7.2 Online soak test**
```
Write a script apps/server/scripts/soak.ts that starts the server and connects 8 bot clients in 2 Team rooms through real WebSockets, playing games back to back for a configurable time (default 2 hours, 5 minutes in CI). After every move, compare all clients' views (T-S-02) and scan for hidden data (T-S-03). Log memory use and the number of games. Add the result to docs/report/test-report.md.
```
**P-7.3 Study pages (learning check + survey)**
```
Read docs/user-study.md. Add a study mode to the client behind a URL like /study?code=XXXX:
consent page → pre-test (set A or B, random, saved) → tutorial lessons 1–4 → one game → post-test (the other set) → survey (Likert + open questions) → thank-you page.
Store results on the server in a `study_results` table (or a JSON file if the database is not used yet) keyed by an anonymous participant code. No names. Show correct answers only at the end. Add Playwright test that completes the whole flow.
```
**P-7.4 Export results**
```
Add an admin-only endpoint and script `pnpm study:export` that writes study results to CSV: participant code, set order, pre score, post score, each answer, each Likert item, open answers, mode, game length, timestamp. Protect it with an ADMIN_TOKEN env variable.
```
**P-7.5 Analyse the study**
```
Read the CSV in docs/report/raw/study.csv. Write a script (Python or TS) that computes: n, mean/median pre and post score, per-question correct rate before and after, Wilcoxon signed-rank test with p-value and effect size, Likert median and distribution per item and per aspect. Produce charts as PNG and write docs/report/user-study-results.md with tables, charts and a short neutral interpretation (do not over-claim with small n). Summarise open answers by theme.
```
**P-7.6 Fix and balance from feedback**
```
Read docs/report/test-report.md, docs/report/user-study-results.md and the open GitHub issues. Group the problems into: bugs, confusing UI, game balance. Propose fixes ordered by impact. For game balance (deck counts, timer), suggest changes and run 2,000 bot games for each option to compare game length and score spread. Do not change docs/rules.md without asking me.
```

---

## รอบ 8 — Maintenance, deploy final, รายงาน (เฟส 8)

**P-8.1 Final deployment**
```
Prepare the production deployment: Dockerfiles with multi-stage builds, docker-compose.prod.yml, health check endpoint, environment variables documented in .env.example, HTTPS through a reverse proxy (Caddy), automatic restart. Update README with a one-command local run and the deployment steps. Run the Playwright smoke test against the deployed URL.
```
**P-8.2 Release v1.0**
```
Write CHANGELOG.md from the merged PRs, bump versions to 1.0.0, create a git tag v1.0.0 and a GitHub release with the notes and the demo URL.
```
**P-8.3 Screenshots and demo video**
```
With Playwright, record the screens needed for the report and slides at 1920x1080: main menu, lobby, game board with preview, fog after CNOT, Bloch spheres, quantum challenge, result screen, tutorial. Save PNGs to docs/report/figures/ with clear names. Record a 2–3 minute demo video of one short scripted Team game (fixed seed) to docs/report/demo.webm.
```
**P-8.4 Chapter 4 — Implementation**
```
Draft docs/report/ch4-implementation.md for the final report (academic English, past tense, 12–15 pages of content). Sections: 4.1 Development process (how the SDLC rounds actually went, with dates from git history), 4.2 System architecture as built, 4.3 Rules engine (state model, matrices, CNOT and fog, RNG), 4.4 Game server (rooms, filtered views, clocks, reconnection), 4.5 Web client (screens, 3D board, preview, visualisation), 4.6 Tutorial and study mode, 4.7 Testing infrastructure and CI, 4.8 Deployment. Reference figures in docs/report/figures/ as "Figure 4.x" with captions, and tables as "Table 4.x". Only describe what exists in the code; mark anything uncertain with [CHECK].
```
**P-8.5 Chapter 5 — Evaluation and Results**
```
Draft docs/report/ch5-evaluation.md from docs/report/test-report.md and docs/report/user-study-results.md. Sections: 5.1 System evaluation (SE-1..SE-6 with numbers), 5.2 User evaluation (participants, procedure, learning check results, survey results, open feedback), 5.3 Discussion (what worked, limitations such as small n and self-selected participants). Keep numbers exactly as in the reports.
```
**P-8.6 Chapter 6 — Conclusion and Future Work**
```
Draft docs/report/ch6-conclusion.md: 6.1 Summary of what was built, 6.2 How each objective in docs/project-overview.md §2 was met (one paragraph each, with evidence), 6.3 Problems and how they were solved, 6.4 Limitations, 6.5 Future work (e.g. more qubits, more gates, mobile app, classroom mode, replays).
```
**P-8.7 AI usage statement and appendices**
```
Draft docs/report/ai-usage.md for the "AI Usage Acknowledgment Statement" in the ICT template: list the AI tools used (Claude, Claude Code, any others the team tells you) and tick the purposes from the template that apply, with one sentence each on how they were used and that the team reviewed and tested all output. Also draft docs/report/appendix-user-manual.md (how to install, create a room, play, tutorial) and docs/report/appendix-tests.md (list of test IDs and what they check).
```

---

## รอบ 9 — Final presentation และส่งมอบ (เฟส 9)

**P-9.1 Demo script**
```
Create a demo mode: `pnpm demo` starts server + client with a fixed seed and a short deck so a Team game shows, in under 5 minutes: preview, a normal move, a push into the other end zone (no score), CNOT into the fog, Measure out of the fog, a touchdown, and the result screen. Write docs/report/demo-script.md with the exact click order and what to say at each step, plus a fallback plan if the network fails (play the recorded video).
```
**P-9.2 Final slides content**
```
Write docs/report/final-slides.md: 15–18 slides of content for the final presentation (title, problem, objectives, what we built, architecture, CNOT/fog, demo, system test results, user study results with charts, challenges, limitations, future work, Q&A). For each slide give the title, 3–5 short bullets, which figure from docs/report/figures/ to use, and speaker notes. Keep the numbers exactly as in the reports.
```
**P-9.3 Handover check**
```
Do a final handover review: README accurate, all docs up to date with the final code, no secrets in git history, no TODO left without an issue, CI green on main, the deployed URL works (run the smoke test), tag v1.0.0 exists (no LICENSE file by team decision; all rights reserved). Write the result to docs/report/handover-checklist.md and list anything the team must still do by hand.
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
