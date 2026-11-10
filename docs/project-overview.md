# Qubit Arena — Project Overview

Senior project, Faculty of Information and Communication Technology, Mahidol University.

| Student ID | Name |
|---|---|
| 6688148 | Bunyakorn Wongchadakul |
| 6688159 | Ayumu Sakurai |
| 6688191 | Kittiyakarn Kaewmungkun |

Advisor: Rawesak Tanawongsuwan

## 1. Problem

Quantum concepts (qubits, superposition, gates, measurement, entanglement) are abstract and usually taught with equations and circuit diagrams, which beginners find hard to picture. *Qubit Touchdown* turns gate cards into football moves, but it is a physical two-player game with no visual explanation of the quantum state. None of the related games we reviewed combines **online team play** with **gate cards that move a shared piece**.

## 2. Objectives

1. Develop a playable **online** game based on Qubit Touchdown with **Solo 1v1** and **Team 2v2** on separate devices.
2. **Visualize** how gates change states: board moves, Bloch sphere, amplitudes and probabilities.
3. **Extend** the game with a two-qubit **CNOT** card, a partner qubit and entanglement (fog), supporting teamwork and strategy.
4. **Evaluate** whether players understand basic gate behaviour better after playing (learning check before/after).

**Success means:** a full online game runs from start to finish, every gate result is correct, and players score higher on the learning check after playing.

## 3. Target users

* University students in CS, IT, software engineering and related fields.
* Quantum beginners who want to explore without heavy mathematics.
* Teachers who want an interactive demonstration (browser, no installation).

The game supports learning; it does not replace a quantum computing course.

## 4. Scope — MVP features

| Feature | Description |
|---|---|
| Game modes | Solo 1v1 and Team 2v2 (Blue P1, P2 vs Red P3, P4; order P1 → P3 → P2 → P4) |
| Six-state board | \|0⟩, \|+⟩, \|−i⟩, \|1⟩, \|−⟩, \|i⟩; end zones \|+⟩ (Blue) and \|−⟩ (Red) |
| Quantum engine | Every move from the gate matrix; measurement follows the Born rule |
| Gate cards | H, X, Y, Z, S, √X, I, Measure, CNOT — 55-card deck |
| Partner qubit and CNOT | Partner starts at \|+⟩; CNOT can entangle it with the ball (fog) |
| Turn and cards | 4 cards per hand, 1 card per turn, no passing, draw back to 4 |
| Touchdown and scoring | Point only for moving the ball into your own end zone on your turn |
| Game end | Target score, time limit or all cards played; tie → Quantum Challenge |
| Online play | Rooms, lobby, bots for empty seats, room chat (before the game) and team chat, server-side randomness, hidden hands, turn timer, reconnection |
| Visualization | Bloch sphere, amplitudes, probabilities, global phase, action history |
| Tutorial | Gates, measurement, touchdowns, CNOT |

**Out of scope:** local hot-seat play, replays, mobile apps. **Optional:** sound and music, only if time allows.

## 5. Development process (SDLC)

| Phase | Main activities | Outputs | Status (Nov 2026) |
|---|---|---|---|
| 1. Planning | Goals, MVP scope, schedule, roles, risks | Proposal and timeline | ✓ Done |
| 2. Analysis | Study Qubit Touchdown rules and Blender prototype, review related games, requirements | Requirements, rule spec | ✓ Done |
| 3. Design | Rules (CNOT, fog), architecture, UI, test plan | GDD, architecture, mockups, test plan | ✓ Done |
| 4. Implementation | Engine → server → client → tutorial, bots, accounts | Playable build after each part | **← now** |
| 5. Testing & Integration | 42 gate cases, bot games, online consistency, user study | Test and evaluation reports | |
| 6. Maintenance | Deploy (Docker, CI), fix playtest bugs, balance deck, sound if time | Deployed game, final report | |

Implementation and testing repeat in rounds: **rules engine → server → client → bots, accounts and ranking.**

## 6. Schedule (Aug 2026 – Apr 2027)

| Phase | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar | Apr |
|---|---|---|---|---|---|---|---|---|---|
| Planning | ■ | ■ | | | | | | | |
| Analysis | | ■ | ■ | | | | | | |
| Design | | | ■ | ■ | | | | | |
| Implementation | | | | | ■ | ■ | ■ | | |
| Testing & Integration | | | | | | | ■ | ■ | |
| Maintenance | | | | | | | | ■ | ■ |
| Milestones | | | | Proposal | | | | | Final |

### Implementation milestones (suggested)

| By | Milestone |
|---|---|
| mid Dec 2026 | Engine complete: 42 gate tests, CNOT/fog, full game rules, bot simulation green |
| early Jan 2027 | Server: rooms, filtered views, timer, reconnection; two browser tabs can play |
| end Jan 2027 | Client 2D playable end to end (Solo + Team), team chat |
| mid Feb 2027 | 3D board, Bloch spheres, tutorial; feature freeze for MVP |
| Feb–Mar 2027 | User study, bug fixing, accounts/ranking if time |
| Apr 2027 | Deployment, final report and presentation |

## 7. Team roles

| Role | Member | Main tasks |
|---|---|---|
| Rules engine & quantum logic | Bunyakorn Wongchadakul | Port prototype rules to TypeScript, CNOT and partner qubit, rule tests |
| Server & online play | Ayumu Sakurai | Rooms, lobby, matchmaking, filtered views, timer, reconnection, database, deployment |
| Client & user interface | Kittiyakarn Kaewmungkun | 3D board, cards, Bloch spheres, animation, tutorial, user evaluation |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Rules hard for beginners | Tutorial, move preview, 60 s turn timer |
| CNOT/entanglement makes the engine complex | Automated tests against 2×2 and 4×4 matrices; Clifford invariant check |
| Online desync or cheating | Server-authoritative design; deck, seed and hidden cards stay on the server |
| Schedule slip | MVP first; bots, accounts and ranking only after the core game works; sound optional |
| Few test participants | Recruit ICT students early; keep sessions about 30 minutes |

## 9. Reference implementation

The team's **Blender prototype** of Qubit Touchdown (Solo and Team modes) passes 73 self-tests including all 42 gate transitions. The web engine is a port of its logic, checked against the same cases, then extended with CNOT.

## 10. References

1. Armbruster K, Duda G, Wong TG. Improving student self-confidence in quantum computing with the Qubit Touchdown board game. arXiv; 2025.
2. Escanez-Exposito D, Correa-Marichal J, Caballero-Gil P. Qubit: The Game. Teaching quantum computing through a game-based approach. ICCS 2023, Springer.
3. Weisz J, Ashoori M, Ashktorab Z. Entanglion: A board game for teaching the principles of quantum computing. CHI PLAY 2018, ACM.
4. Quantum Chess. quantumchess.net
5. Quantum Odyssey. Steam.
6. IBM's Hello Quantum. The Next Web.
