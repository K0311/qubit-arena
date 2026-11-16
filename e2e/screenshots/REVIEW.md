# Screenshot review (P-4.4)

Every screen in ui-spec §3 at 1920 × 1080, taken with `pnpm --filter @qa/e2e screens` on 16 Nov 2026 against
the e2e test server (`TEST_SEED=7`, 18-card `TEST_DECK`). Compared with [docs/ui-spec.md](../../docs/ui-spec.md),
[docs/visual-design.md](../../docs/visual-design.md) and the mood images in [docs/design/](../../docs/design/).
Differences that ui-spec §15 already decides (the reference images break the rules) are not repeated here.

## Screens

| File | Screen (spec) | Matches the spec | Differences found |
|---|---|---|---|
| 01-main-menu | Main menu (§4) | Logo, tagline, Play / Tutorial / Settings / About, player badge, version footer, six-state scene placed with `boardPoint()` | Scene is a flat ring of the six states, not the stadium art of ref-01 (ui-spec §4 asks for the state scene; fine) |
| 02-mode-select | Mode select (§4) | Solo 1v1 / Team 2v2 cards, both ONLINE, Team text names P1, P2 vs P3, P4 | — |
| 03-lobby | Lobby (§5) | Filters, public room list with Join / Watch, quick match, create, join by code | — |
| 04-room-host, 05-room-guest | Room (§6) | Team columns with end zones, seat chips, host-only settings, ready count, START GAME | Deck line shows the room's 55-card deck, while the e2e server deals its 18-card `TEST_DECK` (test mode only) |
| 10/11-game-solo-3d | Game, Solo (§7.1, §7.2) | Layout on the 1920 grid; Blue sees \|+⟩ at the top, Red sees \|−⟩; HUD, clocks, deck, hand, Play Card, state panel, action log | — |
| 12-game-move-preview | Move preview (§7.3) | Card rises with the preview line, target dome and edge in gold | — |
| 13-game-card-hover-detail | Gate card detail (§8.1) | Corner tag, letter, name, Bloch sphere with the rotation axis, description, engine-generated effect, footer | — |
| 14/15-quantum-challenge | Quantum Challenge (§9) | Reason line, progress dots, question card with A–F as sent, side panels with points and status, footer, reveal with explanation | — |
| 16-result | Result (§10) | VICTORY, winner in team colour, score, reason pill, player stats, match summary, Play Again / Main Menu | No trophy or football illustration; background is the blurred board in the player's camera, not the **low cinematic** camera (§10) |
| 17-game-team-3d | Game, Team (§7.1) | Four seats, teammate's hand as gate tags, opponents as counts, team chat panel | — |
| 18-game-solo-2d | 2D board (§7.2, Settings "Board: 2D") | Same layout with the SVG board | — |
| 19-game-spectator | Spectator (§7.1) | No hand, no Play Card, no chat, counts for everyone, Blue's orientation | — |
| 20-settings | Settings (§12) | Display / Gameplay / Account groups, Audio hidden, 3D board and camera views | — |
| 21-about-card-library | About + card library (§8) | All nine cards at detail size | — |
| 22-tutorial-placeholder | Tutorial (§11) | — | **Placeholder**: the tutorial is task P-5.3 |

## Fixed while reviewing

* The scoreboard's "TARGET 7" was written vertically, so the 7 showed as a sideways glyph. It now sits upright in a gold
  box with the number in the ket font.
* Goal view cut off the near end zone at the bottom of the board at 1920 × 1080. The 3D camera's field of view went from
  46° to 50°.

## Still open (not fixed in P-4.4)

| Item | Where | Note |
|---|---|---|
| Result background in the low cinematic camera, trophy/football art | §10 | Cosmetic; good fit for P-8.3 (screenshots and video) |
| Room page shows the room's deck, not the test deck | Room, e2e only | Real games use the room's deck; only the e2e server overrides it |
| Orbitron's zero has a slash (Ø-like) in the scoreboard | §2.3 type | Font choice from the spec; readable, but could switch the score to the ket font if the team prefers |
| `/study/*` | §3 | Placeholder until P-7.3 |
