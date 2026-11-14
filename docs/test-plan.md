# Qubit Arena — Test Plan

> Rules under test: [rules.md](rules.md). Architecture: [architecture.md](architecture.md).
> A feature is **done** only when its tests in this file exist and pass in CI.

## 1. Levels of testing

| Level | Tool | Where | Runs |
|---|---|---|---|
| Unit | Vitest | `packages/engine`, `packages/protocol` | Every commit / PR |
| Property & simulation | Vitest + seeded RNG | `packages/engine/test/sim` | Every PR (short), nightly (long) |
| Integration | Vitest + real `ws` server on a random port | `apps/server/test` | Every PR |
| End-to-end | Playwright (2–4 browser contexts) | `e2e/` | Every PR to `main` |
| User evaluation | Learning check + survey | Playtests | Testing phase (Feb–Mar 2027) |

Coverage goal: **≥ 90 % lines in `packages/engine`**, ≥ 70 % in `apps/server`.

---

## 2. System evaluation (from the proposal, Table 3.3)

| ID | Aspect | What is checked | Method | Pass criteria |
|---|---|---|---|---|
| SE-1 | Quantum gate accuracy | Each gate gives the correct position | Table-driven test: 7 gates × 6 positions | All **42** cases match rules.md §3.2 |
| SE-2 | CNOT and entanglement | Two-qubit results are correct | Compare with 4×4 matrices | See §3.2 below |
| SE-3 | Measurement | Born rule | 4,000 trials per state with seeded RNG | \|0⟩/\|1⟩ never move; others give **45–55 %** zeros |
| SE-4 | Rules and scoring | Turn order, scoring, game flow | Scripted games | See §3.3 below |
| SE-5 | Robustness | No lost cards, no stuck games | Bot-vs-bot simulation | 10,000 games (nightly), 500 (PR); invariants hold after every move |
| SE-6 | Online consistency | Everyone sees the same state; hidden data stays hidden | Integration + E2E | See §3.4 and §3.5 |

---

## 3. Test cases

### 3.1 Engine — single-qubit gates (SE-1)

* **T-G-01..42** — For each card in {H, S, X, Y, Z, SX, I} and each position in {ZERO, ONE, PLUS, MINUS, PLUS_I, MINUS_I}: `apply(card, position)` equals the table in rules.md §3.2. Write it as one `it.each` over the table.
* **T-G-43** — Every matrix is unitary (U†U = I within 1e-9).
* **T-G-44** — Global phase is ignored: Y on \|0⟩ is identified as ONE.
* **T-G-45** — `GATE_TABLE` generated from matrices equals the hard-coded expected table (guards against a typo in either).
* **T-G-46** — Line/arrow generation: S and √X produce one-way arrows; H, X, Y, Z produce two-way lines; I produces none.

### 3.2 Engine — partner qubit, CNOT, fog (SE-2)

* **T-C-01** — Partner at \|+⟩, football at ZERO, ONE, PLUS_I, MINUS_I → after CNOT the football is FOG and both reduced Bloch vectors have length < 1e-9.
* **T-C-02** — Partner \|+⟩, football PLUS → nothing changes.
* **T-C-03** — Partner \|+⟩, football MINUS → football still MINUS, partner becomes \|−⟩ (phase kickback).
* **T-C-04** — Two CNOTs in a row restore the exact previous 4-amplitude state (up to global phase).
* **T-C-05** — Bell state \|00⟩+\|11⟩: football reduced Bloch vector is (0, 0, 0).
* **T-C-06** — In the fog, a single-qubit card keeps the ball in FOG and keeps the state normalised.
* **T-C-07** — In the fog, Measure gives ZERO or ONE and the partner collapses to the correlated state; repeat over 4,000 seeds: 45–55 % each.
* **T-C-08** — After measuring with partner \|0⟩, CNOT acts as I; with partner \|1⟩, CNOT acts as X.
* **T-C-09** — Clifford invariant: after any random sequence of 200 cards (1,000 seeds) the football is always a position or FOG.
* **T-C-10** — Partner resets to \|+⟩ at every kickoff.

### 3.3 Engine — game rules (SE-4)

| ID | Scenario | Expected |
|---|---|---|
| T-R-01 | New Solo game | 55-card deck, 4 cards each, turn order P1 → P2 |
| T-R-02 | New Team game | Turn order P1 → P3 → P2 → P4; P1,P2 = Blue, P3,P4 = Red |
| T-R-03 | Opening roll, Solo and Team | Higher roll plays first (Team: P1 or P3 starts); tie re-rolls (fixed seed) |
| T-R-04 | Kickoff after a touchdown | Ball at ZERO or ONE, partner \|+⟩; the side that did not score plays first |
| T-R-04b | Defaults | Solo and Team both default to target 7 and 15 minutes |
| T-R-05 | Play a card | Card removed from hand, goes to discard, player draws to 4 |
| T-R-06 | Deck empty | Player does not draw; game continues until all hands are empty |
| T-R-07 | Wrong player acts | Action rejected, state unchanged |
| T-R-08 | Card not in hand | Action rejected |
| T-R-09 | Pass attempt | No pass action exists; rejected |
| T-R-10 | Blue moves ball PLUS on Blue turn | Blue +1, Blue kicks off next |
| T-R-11 | Blue moves ball into MINUS (Red zone) on Blue turn | No score |
| T-R-12 | Ball already at PLUS, Blue plays I | No score (must move *into* the zone) |
| T-R-13 | Ball at MINUS (pushed by Blue); Red plays card that leaves it there | No score; Red must move it out and back in |
| T-R-14 | Ball in FOG reaches nothing | No touchdown check while in FOG |
| T-R-15 | Measure at ZERO/ONE | Nothing changes (failed punt), turn still used |
| T-R-16 | Target score reached | Phase FINISHED, endReason TARGET |
| T-R-17 | Time limit reached | Game ends after the current turn, endReason TIME |
| T-R-18 | All cards played | endReason NO_CARDS |
| T-R-19 | Tie at end | Phase CHALLENGE |
| T-R-20 | Challenge: 5 questions, one side higher | That side wins |
| T-R-21 | Challenge tie, sudden death on | Extra questions until one side right, other wrong |
| T-R-22 | Challenge tie, sudden death off | Draw |
| T-R-23 | Turn timer expires | Server plays a random single-qubit card from the hand |
| T-R-24 | Custom deck counts | Deck size and composition follow config |

### 3.4 Server integration (SE-6)

* **T-S-01** — Create room, join with 2 / 4 clients, start game; every client receives `GAME_VIEW`.
* **T-S-02** — After each move, all clients agree on football state, score and turn (compare views).
* **T-S-03** — Hidden data: no message to a client ever contains the deck, the seed, or the opponents' card kinds (scan every outgoing message in the test).
* **T-S-04** — Team chat is delivered only to the sender's team.
* **T-S-05** — Out-of-turn and malformed messages return `ERROR` and do not change state.
* **T-S-06** — Disconnect → seat kept; reconnect with token → same view; after the delay a bot plays.
* **T-S-07** — Turn timer fires on the server even if the client is silent.
* **T-S-08** — Spectator receives public state only.
* **T-S-09** — Rate limit: 50 chat messages in 1 s are throttled.
* **T-S-10** — Quantum Challenge: a bot answers for its side only when no human player of that side is connected (rules.md §8.1).

### 3.5 End-to-end (Playwright)

* **T-E-01** — Solo 1v1: two browser contexts create/join a room and play until the game ends (use a test seed and a test deck so the game is short).
* **T-E-02** — Team 2v2: four contexts, team chat visible only to teammates.
* **T-E-03** — Move preview: selecting a card highlights the destination from rules.md §3.2.
* **T-E-04** — CNOT: ball shows fog; Measure brings it back.
* **T-E-05** — Reload during a game → the player returns to the same game.
* **T-E-06** — Tutorial lesson 1 can be completed.

Test hooks: the server accepts `TEST_SEED` and `TEST_DECK` **only** when `NODE_ENV=test`.

### 3.6 Simulation (SE-5)

* Bot-vs-bot games with random seeds, Solo and Team.
* After **every** action check the invariants in architecture.md §4.3.
* Every game must finish (no infinite loop): cap at 2,000 turns and fail if reached.
* Record and print the seed of any failing game so it can be replayed.

---

## 4. User evaluation (proposal Table 3.4)

| Aspect | Instrument |
|---|---|
| Ease of use | Likert questions (1–5) after playing |
| Gate understanding | **Learning check** before and after playing (same difficulty, different questions) |
| Visual clarity | Likert questions + observation notes |
| Game engagement | Likert questions + open comment |
| Team interaction | Likert questions for Team 2v2 sessions |

Procedure (about 30 minutes per session):

1. Consent and short introduction (2 min).
2. Pre-test learning check: 5 questions on gates and measurement (5 min).
3. Tutorial (5 min), then one Solo or Team game (15 min).
4. Post-test learning check + survey (5 min).

Analysis: compare pre- and post-test scores (paired comparison); report Likert medians. Number of participants: at least 20 (see project-overview §5); recruit ICT students early.

---

## 5. Definition of done (per feature)

- [ ] Rule written in rules.md (or unchanged).
- [ ] Unit tests written first and passing.
- [ ] Invariants checked in simulation.
- [ ] No hidden data in outgoing messages.
- [ ] Lint, typecheck and CI green.
- [ ] Reviewed by one teammate in a pull request.
