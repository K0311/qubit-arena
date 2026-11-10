# Blender prototype (reference only)

`qubit_touchdown.py` is the team's Blender prototype of Qubit Touchdown (Solo and Team modes, ORBIT space style),
exported from the embedded text block of `Qubit touchdown.blend`. It is **not** part of the build, the tests or CI.

Use it for:

* **Look and feel:** ORBIT style board, dome characters, orbit swirl, Bloch sphere, camera views, banners.
  These are written up in [docs/visual-design.md](../../docs/visual-design.md); renders are in `docs/images/`.
* **Cross-checking maths:** its `BOARD_TABLE`, `GATES`, `GATE_ROTATIONS` and `board_edges()` agree with
  `packages/engine` (gates T-G-01..45, edges in `test/board.test.ts`).

Where it differs from [docs/rules.md](../../docs/rules.md), **rules.md wins** (team decision, 11 Nov 2026):

| Prototype | Qubit Arena |
|---|---|
| Borrow card in Team mode, no CNOT | CNOT + partner qubit + fog, no Borrow |
| d6 winner kicks off; the other side plays first | d6 winner plays the first card (rules.md §5) |
| Solo: no target / time limit by default | Solo and Team: 7 points / 15 minutes |
| 52-card Solo deck | 55 cards in both modes (incl. 3 CNOT) |

To open it: Blender 4.5+ → Scripting → open the file → Run Script, then use the "Qubit Touchdown" side panel.
