# Qubit Arena — UI Specification

This file says **what every screen shows, where it goes and what colour it is**. Round 4 (2D client) and round 5 (3D, animation, tutorial) build the client from it.

* **Game rules win.** If this file and [rules.md](rules.md) disagree, rules.md is right and this file must be fixed.
* **Visual references** are in [`docs/design/`](design/). They set the *mood* (dark space, neon frames, glowing nodes). Several of them show game content that does **not** match our rules; §11 lists every difference. Never copy text, effects or layout from a reference image without checking this file.
* **Figma mockups** (built from this spec): <https://www.figma.com/design/sXQMXM7fHUOVETf8lnITEm>, page "📱 Screens". Components: page "🧩 Components".

---

## 1. Global rules

| Topic | Rule |
|---|---|
| Design size | 1920 × 1080. All positions below are on this grid. The layout must still work at **1280 × 720** (scale down; side columns shrink to 300 px). Mobile is out of scope. |
| Background | Dark space: radial gradient `bg/base` → `bg/deep`, a star layer, one or two soft nebula blobs. Built with CSS/canvas or three.js — **never ship the reference PNGs as assets**. |
| Frames | Panels are rounded rectangles (radius 16–24) with a 1.5 px `stroke/subtle` border and `surface/panel` at ~85 % opacity. Important panels get a coloured border plus a soft outer glow in the same colour. |
| Kets | Every state label (\|0⟩, \|+⟩, \|−i⟩ …) uses **JetBrains Mono**. Many UI fonts do not have the ⟩ glyph. Use the real minus sign "−" (U+2212). |
| Colour is never the only signal | Teams also have a label (BLUE/RED) and seat (P1…P4); gate cards always show their letter. |
| Hidden information | Follow rules.md §9 exactly: own hand and teammate's hand visible; opponents show **card backs + count only**; nothing about the deck order, seed or future quiz questions is ever rendered or stored in the client. |
| Source of truth for moves | The board lines, arrows and every preview come from `@qa/engine` (`boardLines()`, preview on the public state). Never hard-code a move in the client. |
| Language | UI text in English for version 1. Keep all strings in one file (`src/i18n/en.ts`) so Thai can be added later. |
| Reduced motion | Setting "Reduce motion" (and `prefers-reduced-motion`) replaces movement animations with fades. |

## 2. Design tokens

Put these in `apps/client/src/theme/tokens.ts` (and CSS variables). Names match the Figma variables.

### 2.1 Colours

| Token | Hex | Use |
|---|---|---|
| `bg/deep` | `#060A22` | Page background |
| `bg/base` | `#0B1236` | Background gradient centre |
| `surface/panel` | `#101A4A` | Panels |
| `surface/raised` | `#16225C` | Rows, inputs, inactive pills |
| `stroke/subtle` | `#2A3A86` | Borders, empty bars |
| `accent/cyan` | `#27E5F7` | Board ring, nodes, primary focus, logo |
| `accent/gold` | `#FFD84D` | Active turn, timer, **move preview**, selected card, Quantum Challenge |
| `accent/purple` | `#A26BFF` | **Fog** / entanglement |
| `accent/green` | `#3DDC97` | Ready, success, "not entangled" |
| `team/blue` | `#2F7BFF` | Blue side (P1, P2), Blue end zone \|+⟩ |
| `team/blue-soft` | `#7FB2FF` | Blue text on dark |
| `team/red` | `#E5484D` | Red side (P3, P4; P2 in Solo), Red end zone \|−⟩ |
| `team/red-soft` | `#FF9AA3` | Red text on dark |
| `text/primary` | `#F4F7FF` | Main text |
| `text/muted` | `#9AA6D6` | Labels, secondary text |

### 2.2 Gate card colours

Adapted from `ref-02-gate-cards.png`. Changed where the reference reused a team colour or gave two gates the same colour.

| Card | Hex | Reference colour | Why changed |
|---|---|---|---|
| H | `#8B5CF6` violet | violet | — |
| X | `#F43F5E` rose | red | Pure red is the Red team colour |
| Y | `#A855F7` purple | purple | — |
| Z | `#10B981` emerald | green | — |
| S | `#2DD4BF` teal | green | Reference S and Z were the same green |
| √X | `#F59E0B` amber | orange | — |
| I | `#94A3B8` slate | blue | Pure blue is the Blue team colour |
| Measure | `#60A5FA` sky | blue | Lighter than team blue |
| CNOT | `#EC4899` pink | pink | — |

> The Figma file still uses the older gate colours; update its `gate/*` variables when convenient. Code follows this table.

### 2.3 Type

| Style | Font | Size / weight | Use |
|---|---|---|---|
| Display | Orbitron | 72–104 / 900 | Logo, big result text |
| H1 | Orbitron | 40 / 700 | Screen titles |
| H2 | Orbitron | 24 / 600 | Panel titles |
| H3 | Exo 2 | 20 / 700 | Names, row titles |
| Body | Exo 2 | 16 / 500 | Text |
| Caption | Exo 2 | 12–13 / 600, uppercase for labels | Labels, pills |
| Ket | JetBrains Mono | 28 / 700 (scale as needed) | State labels, clocks, codes |

All three fonts are on Google Fonts; self-host them with `@fontsource/*` so the game works offline at the demo.

### 2.4 Spacing and effects

* Spacing scale 4 / 8 / 12 / 16 / 24 / 32. Panel padding 20–32.
* Glow = `box-shadow: 0 0 24px <colour>80`. Use glow only on: the active player, the selected card, end zones, the board ring, preview target, primary buttons.
* Buttons: Primary (cyan/blue gradient fill, white text), Secondary (outline cyan), Danger (red fill). Height 56–60, radius 12.

---

## 3. Screens and routes

| # | Screen | Route | Reference image | Figma frame |
|---|---|---|---|---|
| 1 | Main menu | `/` | `ref-01-main-menu.png` | 01 · Main Menu |
| 2 | Mode select | `/play` | `ref-03-mode-select.png` | (cards on 01) |
| 3 | Lobby | `/lobby?mode=solo\|team` | — | 02 · Lobby |
| 4 | Room (waiting) | `/room/:code` | `ref-06` (left half) | 03 · Room |
| 5 | Game — Team 2v2 | `/game/:id` | `ref-05-3d-board.png`, `ref-07` | 04 · Game — Team 2v2 |
| 6 | Game — Solo 1v1 | `/game/:id` | `ref-05-3d-board.png` | 05 · Game — Solo (fog) |
| 7 | Quantum Challenge | overlay on `/game/:id` when phase = CHALLENGE | `ref-04-quantum-challenge.png` | 06 · Quantum Challenge |
| 8 | Result | overlay on `/game/:id` when phase = OVER | `ref-06` (right half) | 07 · Result |
| 9 | Tutorial | `/tutorial/:lesson` | — | (to do) |
| 10 | Settings | `/settings` | `ref-06` (toggles) | (to do) |
| 11 | Card library / About | `/about` | `ref-02-gate-cards.png` | — |
| 12 | Study pages | `/study/*` | — | built in P-7.3 from [user-study.md](user-study.md) |

Reconnecting, errors and "waiting for server" are shown as a toast or a full-screen dim with a spinner; they are not separate routes.

---

## 4. Main menu (`/`) and mode select (`/play`)

**Main menu** (`ref-01`):

* Left half: logo **"QUBIT ARENA"** (Display, `accent/cyan`, glow) with a football swooshing around it, tagline **"Play. Learn. Master Quantum."**, one line explaining the game.
* Menu buttons stacked on the left, 360 px wide: **Play** (Primary) · **Tutorial** · **Settings** · **About**. No "Quit" — it is a web page.
* Right half: decorative scene (space stadium or a floating Bloch sphere + football). In round 4 a static CSS scene is enough; round 5 may render a slowly rotating 3D board here.
* Top right: player badge (name; level/rank only after P-6.1).
* Footer: version and "Senior project · Faculty of ICT, Mahidol University".

**Mode select** (`ref-03`): two large cards side by side.

| Card | Icon | Title | Text | Button |
|---|---|---|---|---|
| Blue frame | 2 people | **Solo 1v1** | "Compete against another player online." | Select |
| Purple/red frame | 4 people | **Team 2v2** | "Blue P1, P2 vs Red P3, P4. Plan with your partner in team chat." | Select |

Both cards carry a green **ONLINE** pill. There is no local or hot-seat mode (out of scope). "Select" opens the lobby filtered to that mode.

## 5. Lobby (`/lobby`)

* Title "LOBBY" top left, "← Back" top right, filter pills **All · Solo 1v1 · Team 2v2**.
* Left (x 80, w 1100): room list. Columns: Room, Mode pill (Solo = blue, Team = red), Players `n / 2` or `n / 4`, Settings (`7 pts · 15 min`), Status pill (Waiting = green, Playing = grey), button **Join** or **Watch** (spectate public rooms).
* Right (x 1220, w 620): **Quick match** panel (cyan border, buttons Solo / Team), **Create room** (mode, public/private, name), **Join by code** (code input in Ket font, e.g. `QX7-42`).

## 6. Room (`/room/:code`)

Combines the room part of `ref-06` ("Game Settings").

* Header: room name, pills: mode, `CODE QX7-42`, `n / 4 READY`. "Leave" (Danger) top right.
* Team columns: **BLUE TEAM** (subtitle "End zone \|+⟩") and **RED TEAM** ("End zone \|−⟩"). Each seat shows a player chip (seat, name) and a ✓ Ready pill, or an empty dashed seat with **+ Add Bot**. Solo shows one seat per side.
* Line under the teams: "Turn order: P1 → P3 → P2 → P4 (opening roll decides which side starts)". Solo: "P1 ⇄ P2".
* **Match settings** panel (host can edit, others read-only). Defaults come from rules.md:

  | Field | Control | Default |
  |---|---|---|
  | Game mode | dropdown | from lobby |
  | Target score | number stepper | **7** |
  | Match timer | time stepper | **15:00** |
  | Turn timer | stepper | **60 s** |
  | Deck | read-only text + "Edit counts" | 55 cards (H7 X4 Y9 Z7 S7 √X12 I3 M3 CNOT3) |
  | Tie-break | toggle "Sudden death" | per rules.md §8.1 |

* Room chat at the bottom left. **Ready** and **START GAME** buttons bottom right; Start is enabled only for the host when every seat is filled (players or bots).

## 7. Game screen (`/game/:id`)

### 7.1 Layout (Team 2v2)

```
┌──────────┬───────────────────────────────────────────┬──────────┐
│ SCORE    │       TURN BAR  P1 → P3 → P2 → P4      (?) │ CLOCKS   │  y 20–116
├──────────┤                                           ├──────────┤
│ BLUE     │                                           │ QUANTUM  │
│ TEAM     │              BOARD (656 × 656)            │ STATE    │
├──────────┤          centre ≈ (955, 450)              │ PANEL    │
│ RED TEAM │                                           │          │
├──────────┤          preview / fog banner             ├──────────┤
│ GATE     ├──────┬────────────────────────────┬───────┤ ACTION   │
│ REFERENCE│ DECK │   HAND (4 cards)           │ PLAY  │ LOG      │
│          │      │                            │ CARD  ├──────────┤
│          │      │                            │       │ TEAM CHAT│
└──────────┴──────┴────────────────────────────┴───────┴──────────┘
 x 30–390                                                x 1530–1890
```

| Region | Position (1920 grid) | Content |
|---|---|---|
| Scoreboard | x 30, y 20, 360 × 96 | BLUE score (team/blue) : RED score (team/red), "TARGET 7" in gold. |
| Turn bar | centred, y 34 | Pills in turn order. Active pill: full team colour, gold border + glow, text "P1 · YOUR TURN" when it is you. Others at 35 % opacity. Solo: `P1 → P2`. |
| Help | (1446, 36), 44 px circle "?" | Opens the gate reference / rules summary as a drawer. |
| Clocks | x 1530, y 20, 360 × 96 | GAME `mm:ss` (match timer counting down), TURN `0:47` in gold with a shrinking bar. Below 10 s the turn clock turns red and pulses. |
| Blue team panel | x 30, y 140, 360 × 214 | Chips P1, P2 (seat, name, "4 cards"). Active player chip highlighted. Your **teammate's hand** is shown as small gate tags (rules.md §9). |
| Red team panel | x 30, y 366, 360 × 184 | Chips P3, P4 with **card count only**. |
| Gate reference | x 30, y 562, 360 × 498 | One row per card: coloured tag + its moves on the board (§8.2 "Board effect" column). |
| Board | 656 × 656, top-left (627, 122) | §7.2. |
| Banner | centred, y 774 | One pill: the move preview, the fog warning, or a last-event message. |
| Deck | x 430, y 850, 150 × 200 | Stacked card backs, "DECK 31 cards left". |
| Hand | x 640, y 850, 4 × 150 × 210, gap 18 | §7.3. |
| Play Card | x 1330, y 900 | Primary button "PLAY CARD", enabled only on your turn with a card selected. Caption "No passing — 1 card per turn". |
| Quantum state panel | x 1530, y 140, 360 × 600 | §7.4. |
| Action log | x 1530, y 756, 360 × 150 | §7.5. |
| Team chat | x 1530, y 920, 360 × 140 | Team mode only; header "TEAM CHAT · BLUE". Spectators and opponents never see it. |

**Solo 1v1** uses the same layout with one chip per side (panels 120 px high), no team chat, and the action log extends to the bottom (360 × 304).

**Spectator**: no hand, no Play Card, no chat; both sides show card counts only.

### 7.2 Board

Adapted from `ref-05-3d-board.png`. Positions and end zones come from **rules.md §2**, not from the reference.

* Six nodes on a circle (R = 300 on the 820 component; 0.8 scale on screen), clockwise from the top: **\|0⟩ (top), \|+⟩ (upper right), \|−i⟩ (lower right), \|1⟩ (bottom), \|−⟩ (lower left), \|i⟩ (upper left)**.
* Each node: dark circle 112 px, cyan border and glow, ket label in Ket font.
* **End zones:** \|+⟩ node is filled `team/blue` with a strong blue glow and the tag **"BLUE END ZONE"**; \|−⟩ is filled `team/red` with **"RED END ZONE"**. So Blue's zone is on the **right** and Red's on the **left** (the reference image has them the other way round — do not copy that).
* Lines and arrows from `boardLines()`: two-way lines solid, one-way arrows (S, √X) with an arrow head; chords (lines through the inside) thinner and dashed. Each line has a small pill label with its gate letters in the gate colour (e.g. "X Y" on \|0⟩–\|1⟩, "H X Z" on \|i⟩–\|−i⟩).
* Centre: a Bloch sphere (≈ 180 px) showing the football's state; in the fog its vector shrinks to a hazy dot.
* **Football**: orange-brown ball with white laces and a warm glow, sitting on its node. In the fog the ball fades to ~35 % and the fog effect covers the board around its last node.
* **Fog effect**: several blurred violet (`accent/purple`) blobs with a "?" — it hides the ball's position. Banner: "FOG · ball entangled with partner — no touchdown until it leaves the fog".
* The partner qubit is **not** on the board. It appears only in the state panel.
* Round 4: SVG. Round 5: three.js with the same props (§10).

### 7.3 Hand and move preview

* 4 gate cards (§8), face up. Opponents' hands are never rendered.
* Click (or keys **1–4**) selects a card: it rises 24 px and gets a gold glow. Click again or Esc deselects. **Enter** = Play Card.
* While a card is selected, the board shows the **preview** computed with `@qa/engine` on the public state:
  * Normal move: gold dashed path from the ball to the target and a gold dashed ring on the target node. Banner: `PREVIEW  H: |0⟩ → |+⟩`.
  * Ball stays: ring on the current node, banner "stays at \|+⟩".
  * Touchdown for your side: banner adds `· TOUCHDOWN +1` and the end zone pulses.
  * Into the opponent's end zone: banner "no score — not your end zone".
  * Measure: both \|0⟩ and \|1⟩ get rings, banner `Measure: 50% |0⟩ · 50% |1⟩`, or "failed punt — nothing happens" at \|0⟩/\|1⟩.
  * CNOT and fog: use the texts in rules.md §4.4 ("stays in fog", "leaves fog → position", "measure: 50 % \|0⟩ / 50 % \|1⟩") and §4.3 ("enters the fog", "nothing changes", "partner becomes \|−⟩").
* When the turn timer runs out the server plays a card (rules.md §6); the log marks it "(timeout)".

### 7.4 Quantum state panel

Top to bottom:

1. Title "QUANTUM STATE" (cyan).
2. Two Bloch spheres side by side: **Football** and **Partner**, each with its current ket (or **"fog"** in purple).
3. **Amplitudes**: single-qubit form `α = 1   β = 0` when not entangled; in the fog show the two-qubit state, e.g. `(|00⟩ + |11⟩) / √2`.
4. **Probabilities** `P(|0⟩)` and `P(|1⟩)` as bars with percentages. On this board they are always 100 / 0 or 50 / 50.
5. **Global phase** of the football (text; it does not change the position — rules.md §2.3).
6. **Fog indicator**: green "● NOT ENTANGLED — ball position is certain" or purple "● ENTANGLED — position hidden in fog".
7. One-line hint that matches the state (e.g. "Measure → \|0⟩ or \|1⟩ (50/50) and the partner collapses too.").

### 7.5 Action log

Adapted from `ref-07-action-history.png`. Newest at the top, scrollable, keeps the whole game.

| Column | Content |
|---|---|
| Dot | Team colour of the player; gauge icon for measurement results; star for touchdowns |
| Time | Game clock **remaining** when it happened (e.g. `14:32`) |
| Text | `P1 played H` (card letter in its gate colour) |
| Result | `|0⟩ → |+⟩`, `stays at |+⟩`, `→ fog`, `Measure → |1⟩`, `failed punt`, `partner → |−⟩` |

Extra row types: **TOUCHDOWN Blue +1** (gold), **Kickoff** ("ball \|1⟩, partner \|+⟩"), **timeout** ("P3 timed out — server played X"), player disconnect / bot takes over. Use seat names (P1…P4) plus player name on hover, not "Player 1".

## 8. Gate cards

Adapted from `ref-02-gate-cards.png`. Same frame style for every card; only the colour, letter and text change.

### 8.1 Anatomy (hand size 150 × 210; detail size 300 × 420 in the card library and tutorial)

1. Top-left corner tag with the letter (cut-corner frame, gate colour).
2. Big letter (Orbitron, gate colour, glow).
3. Name ("Hadamard Gate").
4. Small Bloch sphere with the **rotation axis** highlighted (x for X and √X, y for Y, z for Z and S, the x+z diagonal for H; none for I).
5. One-line description.
6. "Effect" box — **board moves** from the table below (not matrix algebra).
7. Footer keyword in caps.

At hand size, show only 1, 2, 3 and 7; the full card appears on hover (tooltip) and in the card library.

### 8.2 Card text (corrected against rules.md §3.2)

| Card | Name | Description | Board effect (Effect box) | Footer |
|---|---|---|---|---|
| I | Identity Gate | No change. The ball stays. | stays everywhere | KEEP THE STATE |
| X | Pauli-X Gate | 180° about the x axis. | \|0⟩ ↔ \|1⟩, \|i⟩ ↔ \|−i⟩ · \|+⟩, \|−⟩ stay | FLIP |
| Y | Pauli-Y Gate | 180° about the y axis. | \|0⟩ ↔ \|1⟩, \|+⟩ ↔ \|−⟩ · \|i⟩, \|−i⟩ stay | FLIP & PHASE |
| Z | Pauli-Z Gate | 180° about the z axis (phase flip). | \|+⟩ ↔ \|−⟩, \|i⟩ ↔ \|−i⟩ · \|0⟩, \|1⟩ stay | PHASE FLIP |
| H | Hadamard Gate | Swaps the z and x axes. | \|0⟩ ↔ \|+⟩, \|1⟩ ↔ \|−⟩, \|i⟩ ↔ \|−i⟩ | SUPERPOSITION |
| S | Phase Gate | 90° about the z axis. | \|+⟩ → \|i⟩ → \|−⟩ → \|−i⟩ → \|+⟩ · \|0⟩, \|1⟩ stay | QUARTER TURN |
| √X | Square Root of X | 90° about the x axis (half an X). | \|0⟩ → \|−i⟩ → \|1⟩ → \|i⟩ → \|0⟩ · \|+⟩, \|−⟩ stay | HALF FLIP |
| Measure | Measurement | Collapses the ball to \|0⟩ or \|1⟩. | \|±⟩, \|±i⟩ → \|0⟩ or \|1⟩ (50/50) · at \|0⟩/\|1⟩: failed punt · in fog: partner collapses too | COLLAPSE |
| CNOT | Controlled-NOT | **Control = partner, target = ball.** | Partner at \|+⟩: ball at \|0⟩, \|1⟩, \|i⟩, \|−i⟩ → fog · ball at \|+⟩ → no change · ball at \|−⟩ → partner becomes \|−⟩ · a second CNOT clears the fog | ENTANGLE |

The CNOT illustration shows the **partner on top (control, ●)** and the **football below (target, ⊕)**.

Card back (deck, opponents' hands): dark navy, cyan frame, small "QA" logo. Never show the face of an opponent's card.

## 9. Quantum Challenge (overlay)

Adapted from `ref-04-quantum-challenge.png`.

* Dim the game behind it. Title **"QUANTUM CHALLENGE"** (Display, gold, glow) and the reason: "Time's up — tied 5 : 5. Five questions decide the winner."
* Progress: 5 dots (green = done, gold = current, grey = to come). Sudden death shows "SUDDEN DEATH".
* Centre card (960 × 620, gold border): "QUESTION 3 OF 5", a 0:20 timer, the question (may include a ket or a small Bloch sphere), four options **A–D** in a 2 × 2 grid. Your team's selected answer gets a gold border and the pill "YOUR TEAM'S ANSWER".
* Side panels: BLUE (left) and RED (right) with challenge points, their players, and status ("✓ Answer submitted by P2" / "… still answering").
* Footer: "Team mode: any member may answer — the first submission counts." (rules.md §8.1 [OPEN] default) and "One point per correct answer · higher total wins".
* After each question show the correct answer with a one-line explanation for 3 s.
* Questions come one at a time from the server; the client never has the question list or the answers in advance.
* Example from the reference that matches our rules: "Which gate creates an equal superposition from \|0⟩?" → **H**.

## 10. Result (overlay)

Adapted from the right half of `ref-06`.

* Small "VICTORY" / "DEFEAT" / "DRAW" (from your side's view), then **"BLUE TEAM WINS"** (or RED / "DRAW") in Display with the team colour, the final score `7 : 5`, trophy or football illustration.
* **Reason** pill: "Reached the target score (7)", "Time's up", "All cards played", or "Quantum Challenge 3 : 2". (rules.md §8: the result screen must show the reason.)
* Player stats table: seat chip, touchdowns, cards played, Measure, CNOT. Match summary: turns, entanglements, failed punts, longest time in fog.
* Buttons: **Play Again** (same room, rematch vote), **Main Menu**, and — only while the user study is running — **Take the learning check →**.

## 11. Tutorial (`/tutorial/:lesson`)

* Same game layout (Solo) against the tutorial bot with a fixed deck (rules.md §11).
* Left column replaced by the **lesson list** 1–5 (done ✓, current highlighted, locked).
* A coach bubble near the board explains one step at a time and points at the node or card; the right card in the hand is highlighted.
* Right column: lesson **goal** checklist and a progress bar; the state panel is still shown from lesson 2 on.
* Lesson 5 (CNOT and fog) must show the fog, the purple indicator and leaving the fog by Measure and by a second CNOT.

## 12. Settings (`/settings`)

Personal settings only (room settings live in the room, §6). Saved in `localStorage`.

| Group | Setting | Default |
|---|---|---|
| Display | Board: 3D / 2D | 3D (2D on slow devices) |
| Display | Reduce motion | follow system |
| Display | Show learning tips (coach hints and card tooltips) | on |
| Gameplay | Show move preview | on |
| Gameplay | Confirm before playing a card | off |
| Audio (only after P-6.3) | Sound effects / Music / Volume | off until sound exists — hide the group before then |
| Account | Display name | — |

## 13. Animation (round 5)

| Event | Animation | Duration |
|---|---|---|
| Card played | Card flies from hand (or opponent's panel, face shown once played) to the board centre, then fades | 400 ms |
| Ball moves | Ball travels along the line/arrow of that gate; Bloch vector rotates about the gate axis at the same time | 600 ms ease-in-out |
| Ball stays | Small bounce in place | 300 ms |
| Enter fog | Ball fades to 35 %, fog grows from the node, both Bloch vectors shrink to the centre | 500 ms |
| Leave fog | Fog shrinks into the node where the ball appears | 500 ms |
| Measure | Ball flickers between \|0⟩ and \|1⟩, then settles on the server's result | 800 ms |
| Touchdown | End zone flashes, "TOUCHDOWN +1" banner, score ticks up | 1.5 s |
| Kickoff | Ball drops onto \|0⟩ or \|1⟩, partner sphere resets to \|+⟩ | 600 ms |

The animation only plays what the server already decided (`EVENT` messages). It must never decide anything.

## 14. Test ids (for Playwright)

Use `data-testid` on: `menu-play`, `mode-solo`, `mode-team`, `lobby-quick-solo`, `lobby-quick-team`, `room-start`, `room-add-bot-{seat}`, `turn-active`, `clock-game`, `clock-turn`, `score-blue`, `score-red`, `board-node-{ZERO|PLUS|MINUS_I|ONE|MINUS|PLUS_I}`, `ball` (with `data-position`), `fog`, `preview-target`, `hand-card-{0..3}` (with `data-gate`), `play-card`, `opponent-count-{seat}`, `state-fog-indicator`, `action-log`, `team-chat`, `challenge-option-{A..D}`, `result-winner`, `result-reason`.

## 15. Differences from the reference images

| Image | What it shows | What we do instead |
|---|---|---|
| ref-01 main menu | Title "Qubit Touchdown"; About button | Title **Qubit Arena**; keep About, no Quit |
| ref-02 gate cards | X: "\|+⟩ ↔ \|−⟩" | X leaves \|+⟩, \|−⟩ in place; X swaps \|i⟩ ↔ \|−i⟩ |
| ref-02 | Y: "\|+⟩ → \|−i⟩" | Y: \|+⟩ ↔ \|−⟩; \|i⟩, \|−i⟩ stay |
| ref-02 | √X: "\|0⟩ → \|+i⟩, \|1⟩ → \|−i⟩" | √X: \|0⟩ → \|−i⟩, \|1⟩ → \|i⟩ |
| ref-02 | Effects written as algebra (−\|1⟩, i\|1⟩) | Effects written as **board moves**; global phase is not a move |
| ref-02 | CNOT: generic control/target, \|11⟩ ↔ \|10⟩ | Control = **partner**, target = **football**, effects from rules.md §4.3 |
| ref-02 | X red, I and Measure blue, S and Z both green | Colours in §2.2 |
| ref-03 mode select | Text "Compete against another player" only | Both modes marked ONLINE; Team text names P1, P2 vs P3, P4 |
| ref-04 challenge | Single player, light bulb | Two sides with status and points, 5-question progress |
| ref-05 3D board | Blue end zone on the left, Red on the right; extra duplicate nodes; avatar portraits | Blue \|+⟩ upper right, Red \|−⟩ lower left; exactly 6 nodes; seat chips (avatars optional, phase 6) |
| ref-05 | "Turn 1" counter | Turn bar with seat order + game clock + turn timer |
| ref-06 settings | Game mode, target, timer, tips, sound, music in one panel | Split: room settings (§6) and personal settings (§12); sound hidden until P-6.3 |
| ref-06 result | Score and two buttons | Add end reason, stats, and learning-check link during the study |
| ref-07 action log | "Player 1", "State: \|+⟩" only | Seat names, game-clock time, from → to, plus touchdown / kickoff / timeout / fog rows, all from server events |
