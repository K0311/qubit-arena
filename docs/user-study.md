# Qubit Arena — User Study Kit

Used in phase 7 (Testing & Integration). Implements the user evaluation in [test-plan.md](test-plan.md) §4.
The questions below are also the content for the in-game study pages (prompt P-7.3).

> ✓ Approved by the project advisor (Rawesak Tanawongsuwan) on 11 Nov 2026. No further approval or ethics review is needed before collecting data.

## 1. Procedure (about 30 minutes)

| Step | Time | What happens |
|---|---|---|
| 1 | 2 min | Welcome, explain the study, consent form |
| 2 | 5 min | **Pre-test** (Set A or B, chosen at random) |
| 3 | 5 min | Tutorial lessons 1–4 |
| 4 | 15 min | One game (Solo vs a teammate, or Team 2v2) |
| 5 | 5 min | **Post-test** (the other set) + survey |

Counterbalancing: half of the participants get Set A first, half get Set B first, so the two sets do not bias the result.

## 2. Consent text (shown before the pre-test)

> You are invited to try Qubit Arena, a game for learning basic quantum computing, as part of a senior project at the Faculty of ICT, Mahidol University. You will answer a short quiz, play the game, then answer a similar quiz and a short survey. It takes about 30 minutes. Participation is voluntary and you may stop at any time. We record your quiz answers, survey answers and basic game statistics with an anonymous participant code; we do not record your name. Results are used only for this project report.
>
> ☐ I agree to take part.

Collected background (optional): year of study, programme, prior quantum computing experience (none / heard of it / studied it).

## 3. Learning check

Each set has 8 multiple-choice questions of the same difficulty. One point per correct answer. ✓ marks the correct answer.
All answers follow [rules.md](rules.md) §3.

### Set A

1. The ball is at \|0⟩. You play **H**. Where does it go?
   a) \|1⟩ b) \|+⟩ ✓ c) \|−⟩ d) It stays at \|0⟩
2. Which card leaves a ball at **\|0⟩** where it is?
   a) X b) H c) Z ✓ d) Y
3. The ball is at \|+⟩. You play **Measure**. What happens?
   a) It always goes to \|0⟩ b) It stays at \|+⟩ c) 50 % \|0⟩, 50 % \|1⟩ ✓ d) It goes to \|−⟩
4. The ball is at \|+⟩. You play **X**. Where does it go?
   a) \|−⟩ b) \|0⟩ c) \|1⟩ d) It stays at \|+⟩ ✓
5. The ball is at \|+⟩. You play **S**. Where does it go?
   a) \|i⟩ ✓ b) \|−i⟩ c) \|−⟩ d) \|0⟩
6. You are Blue (end zone \|+⟩). The ball is at \|0⟩. Which card scores in one move?
   a) X b) Z c) H ✓ d) Measure
7. The ball is at \|1⟩. You play **Measure**. What happens?
   a) Nothing — it stays at \|1⟩ ✓ b) It goes to \|0⟩ c) 50/50 \|0⟩ or \|1⟩ d) It goes to \|−⟩
8. The partner qubit is at \|+⟩ and the ball is at \|0⟩. You play **CNOT**. What happens?
   a) Nothing b) The ball goes to \|1⟩ c) The ball becomes entangled and enters the fog ✓ d) The ball scores

### Set B

1. The ball is at \|1⟩. You play **H**. Where does it go?
   a) \|0⟩ b) \|+⟩ c) \|−⟩ ✓ d) It stays at \|1⟩
2. Which card leaves a ball at **\|+⟩** where it is?
   a) Z b) X ✓ c) Y d) S
3. The ball is at \|i⟩. You play **Measure**. What happens?
   a) 50 % \|0⟩, 50 % \|1⟩ ✓ b) It stays at \|i⟩ c) It always goes to \|1⟩ d) It goes to \|−i⟩
4. The ball is at \|0⟩. You play **Z**. Where does it go?
   a) \|1⟩ b) It stays at \|0⟩ ✓ c) \|+⟩ d) \|−⟩
5. The ball is at \|i⟩. You play **S**. Where does it go?
   a) \|+⟩ b) \|−i⟩ c) \|−⟩ ✓ d) \|0⟩
6. You are Red (end zone \|−⟩). The ball is at \|1⟩. Which card scores in one move?
   a) H ✓ b) X c) Z d) S
7. The ball is at \|0⟩. You play **Measure**. What happens?
   a) It goes to \|1⟩ b) 50/50 \|0⟩ or \|1⟩ c) Nothing — it stays at \|0⟩ ✓ d) It goes to \|+⟩
8. The partner qubit is at \|+⟩ and the ball is at \|+⟩. You play **CNOT**. What happens?
   a) Nothing changes ✓ b) The ball enters the fog c) The ball goes to \|−⟩ d) The ball goes to \|0⟩

## 4. Survey (after the post-test)

5-point Likert scale: 1 = strongly disagree … 5 = strongly agree.

| # | Aspect | Statement |
|---|---|---|
| 1 | Ease of use | The rules of the game were easy to understand. |
| 2 | Ease of use | The interface was easy to use. |
| 3 | Gate understanding | After playing, I understand what each gate card does to the ball. |
| 4 | Gate understanding | The move preview helped me predict the result of a card. |
| 5 | Visual clarity | The Bloch sphere and state panel made the quantum state clear. |
| 6 | Visual clarity | It was clear which actions I could take on my turn. |
| 7 | Engagement | The game was interesting and enjoyable. |
| 8 | Engagement | I would like to play the game again. |
| 9 | Team interaction | (Team 2v2 only) Playing in a team helped me plan better moves. |
| 10 | Team interaction | (Team 2v2 only) The team chat was useful. |

Open questions:
- What was the most confusing part of the game?
- What helped you learn the most?
- Any other comments?

## 5. Data and analysis

* Store: participant code, set order, pre score, post score, each answer, survey answers, mode played, game length, timestamp. No names.
* Export as CSV (prompt P-7.4).
* Report (prompt P-7.5):
  * Mean and median pre vs post score; per-question correct rate before vs after.
  * Paired comparison (Wilcoxon signed-rank test, because scores are small integers and samples are small). Report the p-value and effect size; do not over-claim with small n.
  * Likert: median and distribution per item; group by aspect.
  * Summary of open answers by theme.
