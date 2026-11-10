# Qubit Arena — Game Rules Specification

> **This file is the source of truth for every game rule.** The rules engine, the server, the client, the tutorial and the tests must all follow it.
> Do not change a rule in code without changing it here first, and get agreement from the team.
> Items marked **[OPEN]** are not yet decided; implement the default shown and keep it configurable.

Version 1.0 — based on the project proposal (November 2026) and the Blender prototype.

---

## 1. Overview

Qubit Arena is an online, turn-based strategy game based on Thomas G. Wong's board game *Qubit Touchdown*.
A football sits on one of six quantum states. Players play quantum gate cards to move it. A team scores by moving the
ball into its **own** end zone on its **own** turn. Qubit Arena adds a second qubit (the *partner qubit*) and a **CNOT**
card that can entangle the ball with the partner, which hides the ball in the **fog** until someone measures it.

Modes:

| Mode | Players | Sides |
|---|---|---|
| Solo 1v1 | 2 | Blue = P1, Red = P2 |
| Team 2v2 | 4 | Blue = P1 + P2, Red = P3 + P4 |

Every player uses their own device. Local play on one computer is out of scope.

---

## 2. The board

### 2.1 Positions

The board has six positions, the six states at the ends of the Bloch sphere axes, arranged on a circle in this order
(clockwise). The circle is drawn with the two end zones facing each other like a football field: \|+⟩ at the top and
\|−⟩ at the bottom, so index 0 (\|0⟩) is at the upper left. See [visual-design.md](visual-design.md) §2.

| Index | State | Bloch vector (x, y, z) | Amplitudes (α, β) for α\|0⟩ + β\|1⟩ |
|---|---|---|---|
| 0 | \|0⟩ | (0, 0, +1) | (1, 0) |
| 1 | \|+⟩ | (+1, 0, 0) | (1/√2, 1/√2) |
| 2 | \|−i⟩ | (0, −1, 0) | (1/√2, −i/√2) |
| 3 | \|1⟩ | (0, 0, −1) | (0, 1) |
| 4 | \|−⟩ | (−1, 0, 0) | (1/√2, −1/√2) |
| 5 | \|i⟩ | (0, +1, 0) | (1/√2, i/√2) |

Use these identifiers in code: `ZERO`, `PLUS`, `MINUS_I`, `ONE`, `MINUS`, `PLUS_I`.

### 2.2 End zones

| Side | End zone |
|---|---|
| Blue (P1 in Solo; P1, P2 in Team) | \|+⟩ |
| Red (P2 in Solo; P3, P4 in Team) | \|−⟩ |

### 2.3 Identifying a position

A position is identified **only by its Bloch vector**. Global phase is ignored (for example Y\|0⟩ = i\|1⟩ is the position \|1⟩).
The engine compares states with |⟨a|b⟩| ≈ 1 (tolerance 1e-9), never by comparing amplitudes directly.

### 2.4 Lines and arrows

The lines on the board are generated from the gate table, not drawn by hand:

* If gate G sends A → B **and** B → A, draw a two-way line A ↔ B labelled G.
* If gate G sends A → B but not B → A, draw a one-way arrow A → B labelled G (this happens for S and √X).
* If G sends A → A, draw nothing (the ball stays).

---

## 3. Cards

### 3.1 Single-qubit gate cards

Each card is a 2×2 unitary matrix applied to the football.

| Card | Matrix | Rotation on the Bloch sphere |
|---|---|---|
| H | (1/√2)·[[1, 1], [1, −1]] | 180° about the x+z axis |
| S | [[1, 0], [0, i]] | 90° about z |
| X | [[0, 1], [1, 0]] | 180° about x |
| Y | [[0, −i], [i, 0]] | 180° about y |
| Z | [[1, 0], [0, −1]] | 180° about z |
| √X | (1/2)·[[1+i, 1−i], [1−i, 1+i]] | 90° about x |
| I | [[1, 0], [0, 1]] | none |

### 3.2 Gate table (verified numerically)

Where the football goes when each card is played. **These 42 results are the acceptance tests for the engine.**

| Card | \|0⟩ | \|1⟩ | \|+⟩ | \|−⟩ | \|i⟩ | \|−i⟩ |
|---|---|---|---|---|---|---|
| H | \|+⟩ | \|−⟩ | \|0⟩ | \|1⟩ | \|−i⟩ | \|i⟩ |
| S | \|0⟩ | \|1⟩ | \|i⟩ | \|−i⟩ | \|−⟩ | \|+⟩ |
| X | \|1⟩ | \|0⟩ | \|+⟩ | \|−⟩ | \|−i⟩ | \|i⟩ |
| Y | \|1⟩ | \|0⟩ | \|−⟩ | \|+⟩ | \|i⟩ | \|−i⟩ |
| Z | \|0⟩ | \|1⟩ | \|−⟩ | \|+⟩ | \|−i⟩ | \|i⟩ |
| √X | \|−i⟩ | \|i⟩ | \|+⟩ | \|−⟩ | \|0⟩ | \|1⟩ |
| I | \|0⟩ | \|1⟩ | \|+⟩ | \|−⟩ | \|i⟩ | \|−i⟩ |

### 3.3 Measure card

* Measures the football in the computational (z) basis, following the Born rule.
* At \|0⟩ or \|1⟩: nothing happens (a **failed punt**).
* At \|+⟩, \|−⟩, \|i⟩ or \|−i⟩: the ball goes to \|0⟩ or \|1⟩ with probability 50 % each.
* In the fog (entangled): see §4.3.
* The random result is drawn **on the server** with the game's seeded RNG.

### 3.4 CNOT card

Two-qubit gate: **control = partner qubit, target = football**. See §4.

### 3.5 Deck

Default deck: **55 cards**. All counts are configurable in room settings.

| Card | H | X | Y | Z | S | √X | I | Measure | CNOT | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| Count | 7 | 4 | 9 | 7 | 7 | 12 | 3 | 3 | 3 | **55** |

---

## 4. Partner qubit, CNOT and the fog

### 4.1 State model

* The engine always stores the **two-qubit state** as 4 complex amplitudes in the basis \|p f⟩ = \|00⟩, \|01⟩, \|10⟩, \|11⟩,
  where *p* = partner (first qubit) and *f* = football (second qubit).
* Single-qubit gate G on the football is applied as **I ⊗ G** (4×4).
* Measure on the football is a projective measurement of qubit *f* in the z basis, followed by renormalisation.
* CNOT (control p, target f) is the matrix [[1,0,0,0],[0,1,0,0],[0,0,0,1],[0,0,1,0]].
* All cards in the game are Clifford operations, so the football is always either **one of the six positions** or
  **maximally entangled** (fog). There is no other case; assert this after every move in debug builds.

### 4.2 Partner qubit

* The partner starts at **\|+⟩** at every kickoff (start of every round).
* Players cannot play cards directly on the partner. Only CNOT and Measure (through correlation) change it.
* The UI shows the partner on a second Bloch sphere.

### 4.3 Effect of CNOT with the partner at \|+⟩

| Football before | Result |
|---|---|
| \|0⟩, \|1⟩, \|i⟩, \|−i⟩ | Entangled → the football enters the **fog**. Both reduced Bloch vectors become (0, 0, 0). |
| \|+⟩ | Nothing changes. |
| \|−⟩ | Football unchanged; the partner picks up a phase and becomes \|−⟩ (**phase kickback**). |

General rule (any partner state): compute the new 4-amplitude state; then

* if the football's reduced Bloch vector has length ≈ 1 → it is at the matching position;
* if the length ≈ 0 → the football is in the **fog**.

### 4.4 Rules in the fog

* The ball has no defined position. The board shows a fog effect instead of a ball; the state panel shows amplitudes.
* **The ball cannot score while in the fog.** A touchdown check is skipped.
* Single-qubit cards are still applied (as I ⊗ G); the ball stays in the fog.
* **Measure** collapses the football to \|0⟩ or \|1⟩ (50 / 50) and the partner collapses to the correlated state.
* A second **CNOT** can undo the entanglement (CNOT is its own inverse) and return the ball to a position.
* After a measurement, CNOT acts on the football like **I** if the partner is \|0⟩ and like **X** if the partner is \|1⟩.
* The move preview for a card in the fog shows "stays in fog", "leaves fog → position", or "measure: 50 % \|0⟩ / 50 % \|1⟩".

---

## 5. Game setup

1. Create a room (public or private) and choose the mode, target score, time limit, turn timer and deck counts.
2. Players take seats. In Team mode, P1 and P2 are Blue and P3 and P4 are Red.
3. The server shuffles the deck with a seeded RNG. The seed never leaves the server.
4. Each player is dealt **4 cards**.
5. **Opening roll (start of the game, both modes):** each side rolls a six-sided die on the server
   (Solo: P1 and P2; Team: Blue and Red). **The higher roll plays first.** A tie rolls again.
   * Solo: the winner takes the first turn.
   * Team: the first player of the winning side takes the first turn (P1 for Blue, P3 for Red), and the order then continues P1 → P3 → P2 → P4.
6. **Kickoff:** a binary die places the football at \|0⟩ or \|1⟩ (50 / 50). The partner is reset to \|+⟩.
7. **After a touchdown:** the scoring side kicks off again (new ball at \|0⟩ or \|1⟩, partner reset to \|+⟩) and the
   **other side plays first** (as in the original game). In Team mode, the next player of that side in the turn order plays.

### Defaults

| Setting | Solo default | Team default |
|---|---|---|
| Target score | 7 | 7 |
| Time limit | 15 min | 15 min |
| Turn timer | 60 s | 60 s |
| Hand size | 4 | 4 |

---

## 6. Turn order

* Solo: **P1 → P2 → P1 → …**
* Team: **P1 → P3 → P2 → P4 → P1 → …** (Blue and Red alternate every turn).
* A player **cannot pass**. They must play exactly one card per turn.

### 6.1 Steps of one turn

| Step | Name | What happens |
|---|---|---|
| 1 | Select card | The player selects one card in their hand. |
| 2 | Preview | The board highlights the destination of that card from the current state (client-side, using the shared engine). |
| 3 | Play card | The player confirms with **Play Card**. The client sends the intent `{type: "PLAY_CARD", cardId}`. |
| 4 | Calculate | The server validates the intent (right player, card in hand, game running) and applies the card with the engine. |
| 5 | Update board | The server broadcasts the new state; clients animate the move (or show "stays"). |
| 6 | Check touchdown | See §7. |
| 7 | Draw and pass | The player draws back up to 4 cards (if the deck has cards) and the turn passes to the next player. |

### 6.2 Turn timer

* Default 60 seconds, run by the server.
* When it runs out, the server plays a **random single-qubit gate card** from that player's hand
  (not Measure and not CNOT). If the hand has no single-qubit gate card, it plays a random card.
* [OPEN] Repeated timeouts do not cause a penalty in version 1.

---

## 7. Scoring

* A side scores **1 point** only when **a player of that side** moves the football **into that side's own end zone** on **their own turn**.
  * Blue scores when the ball arrives at \|+⟩ on a Blue player's turn.
  * Red scores when the ball arrives at \|−⟩ on a Red player's turn.
* "Moves into" means the ball was **not** at that end zone before the card and **is** there after it. Playing I (or any card that leaves it there) does not score.
* A ball pushed into the **other** side's end zone scores nothing. Its owner must move it out and back in to score.
* A ball in the **fog** never scores.
* **Measure at \|0⟩ or \|1⟩** is a failed punt and changes nothing.
* After a touchdown, the **scoring side kicks off** next (§5 step 6–7): new kickoff, partner reset to \|+⟩.

---

## 8. End of game

The game ends when the first of these happens:

1. A side reaches the **target score**.
2. The **time limit** runs out (checked after the current turn finishes).
3. **Every card has been played** (deck empty and every hand empty).

The side with more points wins. If the score is tied → **Quantum Challenge**.

### 8.1 Quantum Challenge (tie-breaker)

* Five multiple-choice questions about the gates, states and measurement used in the game.
* Both sides answer every question; in Team mode the team submits one answer (any member may submit; the first submission counts). [OPEN]
* One point per correct answer; the higher total wins.
* If still tied and **sudden death** is on: one more question at a time until one side is right and the other is wrong.
* If still tied and sudden death is off: the game is a draw.
* Question order and selection are random on the server.

The result screen shows the winner, the final score and the reason the game ended.

---

## 9. Information and hidden data

| Data | Who can see it |
|---|---|
| Own hand | The player |
| Teammate's hand (Team mode) | The player |
| Opponents' hands | **Card count only** |
| Deck order, RNG seed, upcoming quiz questions | **Nobody** — server only |
| Football state, partner state, score, clocks, action log | Everyone, including spectators |
| Team chat | Only that team |

---

## 10. Online play rules

* **Server-authoritative.** The client only sends intents. Every rule, random result and clock runs on the server.
* **Rooms:** public, private (join code) and quick match. Spectators may join any public room.
* **Reconnection:** a player who disconnects keeps their seat. After [OPEN] 30 seconds, a **bot** plays for them until they return.
* **Bot (v1):** plays a random legal card. [later] a simple greedy bot that prefers moves towards its own end zone.

---

## 11. Tutorial

Short guided lessons, played against a bot, in this order:

1. The six states and the board.
2. Basic gates: X, Z, H, then S, √X, Y, I.
3. Measurement and the failed punt.
4. Touchdowns and why pushing the ball into the other end zone does not score.
5. CNOT, the partner qubit and the fog.

---

## 12. Out of scope (version 1)

Local hot-seat play, replays, mobile apps. Sound and music are optional and added only if time allows.

---

## 13. Open decisions (to confirm with the team)

| # | Question | Default used until decided |
|---|---|---|
| 1 | Penalty for repeated turn timeouts | None |
| 2 | How a team submits a Quantum Challenge answer | First submission counts |
| 3 | Delay before a bot replaces a disconnected player | 30 seconds |

Decided on 10 Nov 2026: opening roll in both modes (higher roll plays first, tie re-rolls); Solo uses the same target score (7) and time limit (15 min) as Team; Team order P1 → P3 → P2 → P4.
