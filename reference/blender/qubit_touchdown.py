"""
QUBIT TOUCHDOWN - circular 3D digital edition for Blender 5.2 (also 4.5 LTS)
============================================================================

Digital version of Thomas G. Wong's board game "Qubit Touchdown".
Rules source: K. Armbruster, G. Duda, T. G. Wong, "Improving Student
Self-Confidence in Quantum Computing with the Qubit Touchdown Board Game",
arXiv:2501.10449 (The Physics Teacher 64, 544 (2026)), Section II.

RULES IMPLEMENTED (from the source)
-----------------------------------
* Two players. One scores by getting the football to the + endzone, the other
  by getting it to the - endzone.
* 52 action cards: X, Y, Z, I, H, S, sqrt(X) and Measurement. Shuffle, deal 4 to
  each player, the rest is the draw pile.
* A player kicks off by rolling a binary die (0 or 1, 50:50) and placing the
  football at 0 or 1. The OTHER player then plays the first card.
* Players alternate turns. A turn = play one card, then draw one card.
  Gate cards move the football along the lines/arrows of the board; if the board
  has no line for that card at the current position, the football stays put.
  Lines are bi-directional, arrows are one-way.
* Measurement card ("punt"): at 0 or 1 nothing happens (failed punt); anywhere
  else roll the binary die and place the ball at 0 or 1.
* Touchdown: the scorer kicks off (binary die -> 0 or 1) and then it is the
  other player's turn.
* When the draw pile is empty, players keep alternating with the cards left in
  their hands until none are left. Most touchdowns wins.

Every move is computed from the gate's 2x2 unitary acting on the amplitudes
(alpha, beta). BOARD_TABLE below is the transition table read off the original
board / the circular diagram; the self-test proves the matrix maths reproduces
it exactly.

RULE POINTS THE SOURCE DOES NOT SPECIFY  (marked "AMBIGUOUS" in the code)
---------------------------------------
1. RESOLVED (supplied by the user): deck = H 7, S 7, X 4, Y 9, Z 7, I 3,
   Measurement 3, sqrt(X) 12 (52 cards). Still editable in "Rules & Settings".
2. RESOLVED (confirmed by the user): a touchdown counts only when a player moves
   the ball INTO their own endzone on their own turn. A ball pushed into the
   opponent's endzone does not score; the owner must move it out and back in,
   while the other player may move it straight to their own endzone.
3. Which player kicks off first: "a player kicks off". -> chosen in the UI.
4. Tied score at the end: not specified -> reported as a tie.
5. The arrow controls are NOT part of the original game. They only pick a card
   from your hand whose line points in that screen direction and play it.
   The directions follow the current camera: UP = away from the camera, so in
   a "goal" camera view UP means "toward that endzone".

OPTIONAL MATCH LIMITS (both modes, agreed with the user)
--------------------------------------------------------
* Target score (0 = off) and match time in minutes (0 = off).
  Solo defaults: both off -> the game ends when all cards are played (original).
  Team defaults: 7 points / 15 minutes.
* The game also ends when every card has been played. There is NO reshuffle of
  the discard pile.
* Tie at the end -> Quantum Challenge (5 random questions from an editable
  list; optional sudden death; otherwise a draw). Can be switched off.

TEAM MODE 2 v 2  (PROTOTYPE RULES agreed with the user)
-------------------------------------------------------
* Blue = P1 + P2, scores at +.  Red = P3 + P4, scores at -.  One shared football.
* Fixed turn order P1 -> P3 -> P2 -> P4 -> repeat.
* Deck: the same gate deck + 3 Borrow cards = 55 (all counts editable).
  4 cards per player; after every card use hands are refilled to 4.
* Each team rolls a d6, higher roll wins (tie = both roll again). The winner's
  first player (P1 or P3) kicks off with the binary die; the next player in the
  turn order (always the other team) plays the first card.
* Touchdown: the same house rule per team - a player must move the ball INTO
  their own team's endzone on their own turn. The scorer kicks off next.
* Borrow: play it by choosing a card in your teammate's hand. The teammate
  accepts (you play that card immediately, then both refill to 4) or rejects
  (Borrow is used up, you must still play a card from your own hand).
  Borrow can never take a card from the other team.
* No passing: a card must always be played. Only exceptions: an empty hand
  (automatic pass, deck empty) and PROTOTYPE RULE: a hand of only Borrow cards
  with nothing to request -> discard one Borrow as the turn (ball stays).
* Hidden information: teammates see each other's hands, opponents only see
  card counts. One-computer demo: the panel shows the active team's hands.
  Team chat is visible only to that team.
"""

bl_info = {
    "name": "Qubit Touchdown (Circular 3D)",
    "author": "Generated script",
    "version": (1, 1, 0),
    "blender": (4, 5, 0),   # tested on 4.5.3 LTS and 5.2.0 LTS
    "location": "View3D > Sidebar > Qubit Touchdown",
    "description": "Digital circular edition of Thomas Wong's Qubit Touchdown (solo + 2v2 teams)",
    "category": "Game",
}

import bpy
import bmesh
import cmath
import math
import random
import textwrap
import time
import traceback

from mathutils import Vector, Quaternion, Matrix
from bpy.props import (BoolProperty, EnumProperty, FloatProperty, IntProperty,
                       StringProperty, PointerProperty)
from bpy.types import Operator, Panel, PropertyGroup
from bpy_extras.io_utils import ImportHelper


# =============================================================================
# CONSTANTS
# =============================================================================

QUBIT_TOUCHDOWN_COLLECTION = "Qubit_Touchdown"
HAND_SIZE = 4
DECK_SIZE = 52
INV_SQRT2 = 1.0 / math.sqrt(2.0)

BOARD_RADIUS = 6.3          # disc radius
PATH_RADIUS = 4.6           # radius of the circle the six positions sit on
NODE_RADIUS = 0.82
TOKEN_HEIGHT = 0.42
BLOCH_CENTER = Vector((0.0, 0.0, 3.1))
BLOCH_RADIUS = 1.35

# Visual styles (rules are identical in both):
#   CLASSIC - flat dark board with glowing discs
#   ORBIT   - floating dome characters, swirling orbit lines, Milky Way sky
STYLE = {"name": "ORBIT", "node_z": 0.95, "token_h": 2.07}


def apply_style(name):
    STYLE["name"] = name
    if name == "ORBIT":
        STYLE["node_z"] = 0.95                         # domes float above the floor
        STYLE["token_h"] = 0.95 + DOME_RADIUS + 0.30   # token sits on the dome's head
    else:
        STYLE["node_z"] = 0.0
        STYLE["token_h"] = TOKEN_HEIGHT


DOME_RADIUS = 0.72

P1, P2, P3, P4 = 0, 1, 2, 3
MODE_SOLO, MODE_TEAM = "SOLO", "TEAM"
TEAM_BLUE, TEAM_RED = 0, 1
TEAM_NAMES = ["Blue", "Red"]
TEAM_COLORS = {TEAM_BLUE: (0.20, 0.55, 1.00), TEAM_RED: (1.00, 0.22, 0.22)}
# Endzone -> team that scores there. In solo mode "team 0" is Player 1 and
# "team 1" is Player 2, so P1 scores at + and P2 at - exactly as before.
ENDZONE_TEAM = {"+": 0, "-": 1}
TEAM_ENDZONE = {0: "+", 1: "-"}
TEAM_TURN_ORDER = [P1, P3, P2, P4]          # fixed cyclic order in team mode
TEAMMATE = {P1: P2, P2: P1, P3: P4, P4: P3}
ACTIVE_PHASES = ("KICKOFF", "PLAY", "BORROW")

CARD_ORDER = ["H", "X", "Y", "Z", "S", "SX", "I", "M", "B"]
GATE_CARDS = ["H", "X", "Y", "Z", "S", "SX", "I"]
PLAY_KINDS = GATE_CARDS + ["M"]              # cards that act on the ball
CARD_LABEL = {"H": "H", "X": "X", "Y": "Y", "Z": "Z", "S": "S",
              "SX": "√X", "I": "I", "M": "MEASURE", "B": "BORROW"}
CARD_ASCII = {"H": "H", "X": "X", "Y": "Y", "Z": "Z", "S": "S",
              "SX": "sqrtX", "I": "I", "M": "MEASURE", "B": "BORROW"}

# Deck composition supplied by the user (the paper only says 52 cards).
# H 7, S 7, X 4, Y 9, Z 7, I 3, Measurement 3, sqrt(X) 12  -> 52 cards.
# "B" (Borrow) is used only in team mode: 52 + 3 = 55 cards.
DEFAULT_DECK = {"H": 7, "X": 4, "Y": 9, "Z": 7, "S": 7, "SX": 12, "I": 3, "M": 3, "B": 3}
assert sum(v for k, v in DEFAULT_DECK.items() if k != "B") == 52

COLORS = {
    "0": (0.97, 0.60, 0.20),     # orange
    "+": (0.93, 0.16, 0.55),     # magenta
    "-i": (0.62, 0.25, 0.96),    # purple
    "1": (0.25, 0.50, 0.92),     # blue
    "-": (0.93, 0.29, 0.15),     # red
    "i": (0.25, 0.90, 0.60),     # green
    "BOARD": (0.015, 0.02, 0.04),
    "RIM": (0.35, 0.55, 1.00),
    "TEXT": (0.96, 0.96, 0.98),
    "GOLD": (1.00, 0.82, 0.30),
    "SPHERE": (0.35, 0.55, 1.00),
    "VECTOR": (1.00, 1.00, 1.00),
    "GRID": (0.55, 0.65, 0.85),
}


# =============================================================================
# QUANTUM STATE SYSTEM
# =============================================================================

class QuantumState:
    """One of the six board positions: amplitudes, Bloch vector, board layout."""

    def __init__(self, key, label, amps, board_angle_deg):
        self.key = key
        self.label = label                    # Dirac label shown to players
        self.amps = (complex(amps[0]), complex(amps[1]))
        self.bloch = amps_to_bloch(*self.amps)
        self.board_angle = math.radians(board_angle_deg)

    def board_xy(self):
        return Vector((PATH_RADIUS * math.cos(self.board_angle),
                       PATH_RADIUS * math.sin(self.board_angle), 0.0))


def normalize_amps(a, b):
    a, b = complex(a), complex(b)
    n = math.sqrt(abs(a) ** 2 + abs(b) ** 2)
    if not math.isfinite(n) or n < 1e-12:
        return (1 + 0j, 0j)
    return (a / n, b / n)


def amps_to_bloch(a, b):
    """x = 2Re(a* b), y = 2Im(a* b), z = |a|^2 - |b|^2 (global phase drops out)."""
    a, b = normalize_amps(a, b)
    ab = a.conjugate() * b
    return (2.0 * ab.real, 2.0 * ab.imag, abs(a) ** 2 - abs(b) ** 2)


# Circular layout taken from the provided diagram:
#   + top, -i upper right, 1 lower right, - bottom, i lower left, 0 upper left.
# Opposite positions are antipodes on the Bloch sphere (0/1, +/-, i/-i).
QUANTUM_STATES = {
    "0": QuantumState("0", "|0>", (1, 0), 150),
    "1": QuantumState("1", "|1>", (0, 1), -30),
    "+": QuantumState("+", "|+>", (INV_SQRT2, INV_SQRT2), 90),
    "-": QuantumState("-", "|->", (INV_SQRT2, -INV_SQRT2), -90),
    "i": QuantumState("i", "|i>", (INV_SQRT2, 1j * INV_SQRT2), -150),
    "-i": QuantumState("-i", "|-i>", (INV_SQRT2, -1j * INV_SQRT2), 30),
}
STATE_ORDER = ["0", "+", "-i", "1", "-", "i"]


def identify_state(a, b, tol=1e-6):
    """Return the board position whose Bloch vector matches (a, b), else None."""
    x, y, z = amps_to_bloch(a, b)
    for key, st in QUANTUM_STATES.items():
        bx, by, bz = st.bloch
        if (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2 < tol:
            return key
    return None


def probabilities(a, b):
    """Born rule: P(0) = |alpha|^2, P(1) = |beta|^2."""
    a, b = normalize_amps(a, b)
    return abs(a) ** 2, abs(b) ** 2


def global_phase_text(a, b, key):
    """e.g. Y|0> = i|1>: shows the (physically irrelevant) global phase."""
    ca, cb = QUANTUM_STATES[key].amps
    g = a / ca if abs(ca) > 0.1 else b / cb
    g = g / abs(g) if abs(g) > 1e-12 else 1
    for val, txt in ((1, ""), (-1, "-"), (1j, "i"), (-1j, "-i")):
        if abs(g - val) < 1e-6:
            return txt
    return f"e^(i{math.degrees(cmath.phase(g)):.0f}°)"


def fmt_c(z):
    re = 0.0 if abs(z.real) < 5e-4 else z.real
    im = 0.0 if abs(z.imag) < 5e-4 else z.imag
    if im == 0.0:
        return f"{re:.3f}"
    if re == 0.0:
        return f"{im:.3f}i"
    return f"({re:.3f}{'+' if im >= 0 else '-'}{abs(im):.3f}i)"


# =============================================================================
# QUANTUM GATES
# =============================================================================

R2 = INV_SQRT2
GATES = {
    "I": ((1, 0), (0, 1)),
    "X": ((0, 1), (1, 0)),
    "Y": ((0, -1j), (1j, 0)),
    "Z": ((1, 0), (0, -1)),
    "H": ((R2, R2), (R2, -R2)),
    "S": ((1, 0), (0, 1j)),
    "SX": ((0.5 + 0.5j, 0.5 - 0.5j), (0.5 - 0.5j, 0.5 + 0.5j)),   # sqrt(X)
}

# Equivalent Bloch rotation (axis, angle) of each gate, used only to animate.
GATE_ROTATIONS = {
    "I": ((0, 0, 1), 0.0),
    "X": ((1, 0, 0), math.pi),
    "Y": ((0, 1, 0), math.pi),
    "Z": ((0, 0, 1), math.pi),
    "H": ((R2, 0, R2), math.pi),
    "S": ((0, 0, 1), math.pi / 2),
    "SX": ((1, 0, 0), math.pi / 2),
}

GATE_INFO = {
    "H": "Hadamard: 180° about the (X+Z) axis",
    "X": "Pauli X: 180° about the X axis",
    "Y": "Pauli Y: 180° about the Y axis",
    "Z": "Pauli Z: 180° about the Z axis",
    "S": "S: 90° about the Z axis",
    "SX": "√X: 90° about the X axis",
    "I": "Identity: no change",
    "M": "Measurement (punt): 0/1 stays; otherwise 50:50 to 0 or 1",
}

# Transition table of the original board (paper Fig. 2 / provided diagram).
# Used ONLY to verify the matrix maths and to draw labels; play uses matrices.
BOARD_TABLE = {
    "0": {"X": "1", "Y": "1", "Z": "0", "H": "+", "S": "0", "SX": "-i", "I": "0"},
    "1": {"X": "0", "Y": "0", "Z": "1", "H": "-", "S": "1", "SX": "i", "I": "1"},
    "+": {"X": "+", "Y": "-", "Z": "-", "H": "0", "S": "i", "SX": "+", "I": "+"},
    "-": {"X": "-", "Y": "+", "Z": "+", "H": "1", "S": "-i", "SX": "-", "I": "-"},
    "i": {"X": "-i", "Y": "i", "Z": "-i", "H": "-i", "S": "-", "SX": "0", "I": "i"},
    "-i": {"X": "i", "Y": "-i", "Z": "i", "H": "i", "S": "+", "SX": "1", "I": "-i"},
}


def apply_gate(gate, amps):
    U = GATES[gate]
    a, b = amps
    return normalize_amps(U[0][0] * a + U[0][1] * b, U[1][0] * a + U[1][1] * b)


def gate_destination(gate, key):
    """Board position reached from `key` by `gate`, computed from the unitary."""
    return identify_state(*apply_gate(gate, QUANTUM_STATES[key].amps))


def board_edges():
    """Lines (bi-directional) and arrows (one-way) of the board, from the maths."""
    edges = {}
    for a in STATE_ORDER:
        for g in GATE_CARDS:
            b = gate_destination(g, a)
            if b is None or b == a:
                continue
            back = gate_destination(g, b) == a
            key = tuple(sorted((a, b))) if back else (a, b)
            e = edges.setdefault((key, back), {"a": key[0], "b": key[1],
                                               "directed": not back, "gates": []})
            if g not in e["gates"]:
                e["gates"].append(g)
    return list(edges.values())


# =============================================================================
# GAME STATE, HISTORY AND LOGIC  (pure Python, no bpy)
# =============================================================================

class GameHistory:
    def __init__(self):
        self.entries = []
        self.move_no = 0

    def clear(self):
        self.entries = []
        self.move_no = 0

    def add_kickoff(self, player_name, result, manual):
        how = "die entered" if manual else "binary die"
        self.entries.append(f"Kickoff by {player_name}: {how} -> |{result}>")

    def add_move(self, player_name, card, before, after, extra=None, borrowed_from=None):
        self.move_no += 1
        src = f"  (borrowed from {borrowed_from})" if borrowed_from else ""
        line = (f"{self.move_no}. {player_name}  {CARD_LABEL[card]}   "
                f"{QUANTUM_STATES[before].label} → {QUANTUM_STATES[after].label}{src}")
        self.entries.append(line)
        if extra:
            for e in extra:
                self.entries.append("      " + e)

    def add_note(self, text):
        self.entries.append("   " + text)


class Card:
    """One physical card: a unique id and its kind (gate, Measure or Borrow).
    Where it is (deck / discard / a player's hand) is given by the list it is in."""
    __slots__ = ("id", "kind")

    def __init__(self, cid, kind):
        self.id = cid
        self.kind = kind

    def __repr__(self):
        return f"Card({self.id}, {self.kind})"


# -----------------------------------------------------------------------------
# Quantum Challenge question bank (editable). "answer" = index of the correct
# option. Options are shuffled when a question is asked.
# -----------------------------------------------------------------------------
QUANTUM_QUESTIONS = [
    {"q": "What does the X gate do to |0>?",
     "options": ["|1>", "|0>", "|+>", "|->"], "answer": 0},
    {"q": "What is H|0> (Hadamard on |0>)?",
     "options": ["|+>", "|->", "|1>", "|i>"], "answer": 0},
    {"q": "Probability of measuring 0 in the state |+>?",
     "options": ["50%", "0%", "100%", "25%"], "answer": 0},
    {"q": "You measure a qubit that is exactly |1>. What do you get?",
     "options": ["1 every time", "0 every time", "0 or 1, 50:50", "It cannot be measured"], "answer": 0},
    {"q": "Which gate turns |+> into |->?",
     "options": ["Z", "X", "S", "I"], "answer": 0},
    {"q": "For |psi> = a|0> + b|1>, which condition must hold?",
     "options": ["|a|^2 + |b|^2 = 1", "a + b = 1", "|a| = |b|", "a * b = 0"], "answer": 0},
    {"q": "Where is |0> on the Bloch sphere?",
     "options": ["North pole", "South pole", "On the equator", "At the centre"], "answer": 0},
    {"q": "Applying H twice (H then H) to any qubit gives...",
     "options": ["The original state", "|0> always", "|1> always", "A random state"], "answer": 0},
    {"q": "Applying S twice is the same as which gate?",
     "options": ["Z", "X", "H", "I"], "answer": 0},
    {"q": "Applying sqrt(X) twice is the same as which gate?",
     "options": ["X", "Z", "H", "S"], "answer": 0},
    {"q": "What does a global phase (e.g. -|0> instead of |0>) change in measurement results?",
     "options": ["Nothing", "It swaps 0 and 1", "It makes 0 and 1 equally likely", "It doubles the probabilities"],
     "answer": 0},
    {"q": "What happens to a superposition when it is measured?",
     "options": ["It collapses to the measured basis state", "It stays the same superposition",
                 "It is copied", "It becomes |+>"], "answer": 0},
    {"q": "What is Y|0>?",
     "options": ["i|1>", "|0>", "-|0>", "|+>"], "answer": 0},
    {"q": "Which state lies on the +Y axis of the Bloch sphere?",
     "options": ["|i> = (|0> + i|1>)/sqrt2", "|+> = (|0> + |1>)/sqrt2", "|1>", "|0>"], "answer": 0},
    {"q": "Probability of measuring 1 in the state |i>?",
     "options": ["50%", "0%", "100%", "75%"], "answer": 0},
]
CHALLENGE_QUESTIONS = 5


class GameState:
    """Plain data describing the match."""

    def __init__(self):
        self.phase = "SETUP"   # SETUP -> [ROLL] -> KICKOFF -> PLAY [<-> BORROW] -> GAME_OVER / CHALLENGE
        self.mode = MODE_SOLO         # SOLO (1 v 1) or TEAM (2 v 2)
        self.cards = "DIGITAL"        # DIGITAL deck or PHYSICAL cards (solo only)
        self.names = ["Player 1", "Player 2"]
        self.team_of = [0, 1]         # player -> team (solo: each player is a "team")
        self.order = [P1, P2]         # fixed cyclic turn order
        self.team_names = ["Player 1", "Player 2"]
        self.scores = [0, 0]          # per team
        self.current = P1             # whose turn (or who kicks off)
        self.kicker = P1
        self.deck = []
        self.discard = []
        self.hands = [[], []]
        self.total_cards = 0
        self.position = None          # board key of the football
        self.amps = (1 + 0j, 0j)      # actual amplitudes (keeps global phase)
        self.last_measure = ""
        self.dice = [None, None]      # team dice (team mode)
        self.pending = None           # Borrow request {"from", "to", "kind"}
        self.target = 0               # 0 = no target score
        self.time_limit = 0.0         # seconds, 0 = no timer
        self.elapsed = 0.0
        self.clock_paused = False
        self.tie_break = False        # Quantum Challenge on a tie
        self.sudden_death = True
        self.challenge = None
        self.winner = None            # team index, -1 = draw
        self.result = ""
        self.end_reason = ""
        self.chat = [[], []]          # team chat (team mode)
        self.message = "Choose the mode and settings, then press Start Game."


class QuantumGame:
    """All rule logic (no bpy). Each action returns (events, error)."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.state = GameState()
        self.history = GameHistory()

    # ---- setup ---------------------------------------------------------------
    def new_game(self, mode=MODE_SOLO, cards="DIGITAL", deck_counts=None, names=None,
                 first_kicker=P1, target=0, time_limit=0.0, tie_break=False,
                 sudden_death=True):
        s = GameState()
        s.mode = mode
        s.cards = "DIGITAL" if mode == MODE_TEAM else cards
        if mode == MODE_TEAM:
            s.names = list(names) if names else ["P1", "P2", "P3", "P4"]
            s.team_of = [TEAM_BLUE, TEAM_BLUE, TEAM_RED, TEAM_RED]
            s.order = list(TEAM_TURN_ORDER)
            s.team_names = list(TEAM_NAMES)
        else:
            s.names = list(names) if names else ["Player 1", "Player 2"]
            s.team_of = [0, 1]
            s.order = [P1, P2]
            s.team_names = list(s.names)
        n = len(s.names)
        s.hands = [[] for _ in range(n)]
        s.target = max(0, int(target))
        s.time_limit = max(0.0, float(time_limit))
        s.tie_break = bool(tie_break)
        s.sudden_death = bool(sudden_death)
        if s.cards == "DIGITAL":
            counts = dict(DEFAULT_DECK if deck_counts is None else deck_counts)
            if mode != MODE_TEAM:
                counts["B"] = 0               # Borrow needs a teammate
            kinds = [c for c in CARD_ORDER for _ in range(max(0, int(counts.get(c, 0))))]
            self.rng.shuffle(kinds)
            s.deck = [Card(i + 1, k) for i, k in enumerate(kinds)]
            s.total_cards = len(s.deck)
            for _ in range(HAND_SIZE):
                for p in range(n):
                    if s.deck:
                        s.hands[p].append(s.deck.pop())
        if mode == MODE_TEAM:
            s.phase = "ROLL"
            s.message = "Each team rolls a die - the higher roll kicks off."
        else:
            s.phase = "KICKOFF"
            s.kicker = s.current = first_kicker
            s.message = f"{s.names[first_kicker]} kicks off: roll the binary die."
        self.state = s
        self.history.clear()
        return [{"type": "reset"}]

    # ---- helpers -------------------------------------------------------------
    def roll_binary_die(self):
        return 0 if self.rng.random() < 0.5 else 1

    def is_team(self):
        return self.state.mode == MODE_TEAM

    def mate(self, p):
        return TEAMMATE.get(p) if self.is_team() else None

    def next_player(self, p):
        o = self.state.order
        return o[(o.index(p) + 1) % len(o)]

    def team_of(self, p):
        return self.state.team_of[p]

    def player_label(self, p):
        s = self.state
        if s.mode == MODE_TEAM:
            return f"{s.names[p]} ({s.team_names[s.team_of[p]]})"
        return s.names[p]

    def team_label(self, t):
        return self.state.team_names[t]

    def turn_player(self):
        """The player the panel speaks to (current player / kicker)."""
        s = self.state
        if s.phase == "KICKOFF":
            return s.kicker
        if s.phase in ("PLAY", "BORROW"):
            return s.current
        return None

    def playable_cards(self, player=None):
        """Card kinds the player may play onto the board (Borrow excluded)."""
        s = self.state
        p = s.current if player is None else player
        if s.cards == "PHYSICAL":
            return list(PLAY_KINDS)
        kinds = {c.kind for c in s.hands[p]}
        return [k for k in PLAY_KINDS if k in kinds]

    def card_count(self, kind, player=None):
        s = self.state
        p = s.current if player is None else player
        return sum(1 for c in s.hands[p] if c.kind == kind)

    def hand_summary(self, p):
        """[(kind, count)] in card order - only for the player's own team UI."""
        s = self.state
        return [(k, n) for k in CARD_ORDER
                for n in [sum(1 for c in s.hands[p] if c.kind == k)] if n]

    def preview(self, card):
        """Destination of a card from the current position (None for unknown)."""
        s = self.state
        if s.position is None:
            return None
        if card == "M":
            return s.position if s.position in ("0", "1") else "0/1"
        return gate_destination(card, s.position)

    def is_over(self):
        s = self.state
        if s.cards == "PHYSICAL":
            return False
        return not s.deck and not any(s.hands)

    def census(self):
        """Card bookkeeping (counts only - never card identities)."""
        s = self.state
        hands = [len(h) for h in s.hands]
        ids = ([c.id for c in s.deck] + [c.id for c in s.discard]
               + [c.id for h in s.hands for c in h])
        return {"deck": len(s.deck), "discard": len(s.discard), "hands": hands,
                "total": len(ids), "expected": s.total_cards,
                "duplicates": len(ids) - len(set(ids))}

    def _take(self, p, kind):
        hand = self.state.hands[p]
        for i, c in enumerate(hand):
            if c.kind == kind:
                return hand.pop(i)
        return None

    def _refill(self, p):
        """Draw until the hand has HAND_SIZE cards or the draw pile is empty."""
        s = self.state
        if s.cards != "DIGITAL":
            return
        while len(s.hands[p]) < HAND_SIZE and s.deck:
            s.hands[p].append(s.deck.pop())

    # ---- team dice -----------------------------------------------------------
    def roll_team(self, team, value=None):
        s = self.state
        if s.phase != "ROLL":
            return None, "It is not time to roll the team dice."
        if s.dice[team] is not None:
            return None, f"{s.team_names[team]} has already rolled."
        if value is None:
            value = self.rng.randint(1, 6)
        if not 1 <= int(value) <= 6:
            return None, "A die shows 1 to 6."
        s.dice[team] = int(value)
        self.history.add_note(f"{s.team_names[team]} rolls {value}")
        events = [{"type": "dice", "team": team, "value": int(value)}]
        if None in s.dice:
            other = 1 - team
            s.message = f"{s.team_names[team]} rolled {value}. {s.team_names[other]} rolls next."
            return events, None
        b, r = s.dice
        if b == r:
            self.history.add_note(f"Tie {b}-{r}: both teams roll again")
            s.dice = [None, None]
            s.message = f"Tie {b}-{r}! Both teams roll again."
            events.append({"type": "dice_tie", "value": b})
            return events, None
        w = TEAM_BLUE if b > r else TEAM_RED
        s.kicker = s.current = next(p for p in s.order if s.team_of[p] == w)
        s.phase = "KICKOFF"
        s.message = (f"{s.team_names[w]} wins the roll {max(b, r)}-{min(b, r)}. "
                     f"{self.player_label(s.kicker)} kicks off.")
        self.history.add_note(f"{s.team_names[w]} starts ({max(b, r)}-{min(b, r)})")
        events.append({"type": "dice_win", "team": w, "dice": (b, r)})
        return events, None

    # ---- kickoff -------------------------------------------------------------
    def kickoff(self, result=None):
        s = self.state
        if s.phase != "KICKOFF":
            return None, "It is not time to kick off."
        manual = result is not None
        if result is None:
            result = self.roll_binary_die()
        if result not in (0, 1):
            return None, "The binary die can only give 0 or 1."
        before = s.position
        s.position = str(result)
        s.amps = QUANTUM_STATES[s.position].amps
        self.history.add_kickoff(s.names[s.kicker], result, manual)
        s.current = self.next_player(s.kicker)
        s.phase = "PLAY"
        events = [{"type": "kickoff", "from": before, "to": s.position,
                   "result": result, "player": s.kicker}]
        events += self._skip_empty_hands()
        if s.phase == "PLAY":
            s.message = (f"Kickoff landed on |{result}>. "
                         f"{self.player_label(s.current)}: play a card.")
        return events, None

    # ---- playing a card ------------------------------------------------------
    def play_card(self, card):
        s = self.state
        if s.phase == "BORROW":
            return None, "Wait for the teammate to accept or reject the Borrow request."
        if s.phase != "PLAY":
            return None, {"KICKOFF": "Kick off first.", "GAME_OVER": "The game is over.",
                          "SETUP": "Start a game first.", "ROLL": "Roll the team dice first.",
                          "CHALLENGE": "The Quantum Challenge is running."}.get(s.phase, "Not now.")
        if card == "B":
            return None, "Borrow is played by choosing a card in your teammate's hand."
        if card not in PLAY_KINDS:
            return None, f"Unknown card {card}."
        player = s.current
        obj = None
        if s.cards == "DIGITAL":
            obj = self._take(player, card)
            if obj is None:
                return None, f"{s.names[player]} has no {CARD_LABEL[card]} card."
        return self._resolve(player, card, obj), None

    def _apply_card(self, player, card):
        """Move the ball with a gate or Measure card. Returns (events, history extras)."""
        s = self.state
        before = s.position
        events, extra = [], []
        if card == "M":
            p0, p1 = probabilities(*s.amps)
            if before in ("0", "1"):
                # Failed punt: measuring 0 or 1 gives the same value, ball stays.
                result = int(before)
                effective = False
                extra.append(f"Result: {result}  (failed punt, P({result}) = 100%)")
            else:
                result = 0 if self.rng.random() < p0 else 1
                effective = True
                extra.append(f"Result: {result}   Probability: {100 * (p0 if result == 0 else p1):.0f}%")
            s.position = str(result)
            s.amps = QUANTUM_STATES[s.position].amps
            s.last_measure = (f"Measured {result}  (P(0) = {100 * p0:.0f}%, "
                              f"P(1) = {100 * p1:.0f}%)")
            events.append({"type": "measure", "from": before, "to": s.position,
                           "result": result, "p0": p0, "p1": p1,
                           "effective": effective, "player": player})
        else:
            s.amps = apply_gate(card, s.amps)
            after = identify_state(*s.amps)
            if after is None:                 # cannot happen with these six states
                raise RuntimeError("State left the six board positions")
            s.position = after
            events.append({"type": "gate", "card": card, "from": before,
                           "to": after, "player": player})
        return events, extra

    def _resolve(self, player, kind, card_obj, lender=None):
        """Apply a card, discard it, refill hands, then score / next turn."""
        s = self.state
        before = s.position
        events, extra = self._apply_card(player, kind)
        self.history.add_move(s.names[player], kind, before, s.position, extra,
                              borrowed_from=s.names[lender] if lender is not None else None)
        if card_obj is not None:
            s.discard.append(card_obj)
        self._refill(player)
        if lender is not None:
            self._refill(lender)
        events += self._after_move(player, before)
        return events

    def _after_move(self, player, before):
        s = self.state
        events = []
        # Touchdown rule (confirmed by the user): a touchdown counts only when
        # the player whose turn it is moves the ball INTO their own (team's)
        # endzone. Pushed into the opponent's endzone -> no score; the owner
        # must move it out and back in. Staying in place never scores.
        owner = ENDZONE_TEAM.get(s.position)
        team = s.team_of[player]
        entered = s.position != before
        scorer = owner if (owner is not None and owner == team and entered) else None
        if owner is not None and scorer is None:
            why = (f"moved there by {self.player_label(player)}" if owner != team
                   else "it must leave the endzone and come back in")
            self.history.add_note(f"No score: ball in {s.team_names[owner]}'s endzone ({why})")
            events.append({"type": "no_score", "owner": owner, "player": player,
                           "entered": entered})
        if scorer is not None:
            s.scores[scorer] += 1
            note = (f"TOUCHDOWN {s.team_names[scorer]} ({s.position} endzone)"
                    f"   Score {s.scores[0]}-{s.scores[1]}")
            self.history.add_note(note)
            events.append({"type": "touchdown", "team": scorer, "player": player})
            if s.target and s.scores[scorer] >= s.target:
                return events + self._finish("target")
            if self.is_over():
                return events + self._finish("cards")
            s.phase = "KICKOFF"
            s.kicker = s.current = player
            s.message = (f"Touchdown {s.team_names[scorer]}! "
                         f"{self.player_label(player)} kicks off.")
            return events
        if self.is_over():
            return events + self._finish("cards")
        s.current = self.next_player(player)
        events += self._skip_empty_hands()
        if s.phase == "PLAY":
            self._turn_message()
        return events

    def _turn_message(self):
        s = self.state
        who = self.player_label(s.current)
        s.message = f"{who}: play a card."
        owner = ENDZONE_TEAM.get(s.position)
        if owner is not None:
            if owner == s.team_of[s.current]:
                s.message = (f"Ball is in your own endzone, {who}: move it out, "
                             "then bring it back in to score.")
            else:
                s.message = (f"Ball is in {s.team_names[owner]}'s endzone (no score). "
                             f"{who}: play a card.")

    def _skip_empty_hands(self):
        """With an empty draw pile a player may run out first: they pass."""
        s = self.state
        if s.cards != "DIGITAL":
            return []
        if self.is_over():
            return self._finish("cards")
        events = []
        for _ in range(len(s.order)):
            if s.hands[s.current]:
                break
            self.history.add_note(f"{s.names[s.current]} has no cards left - pass.")
            events.append({"type": "pass", "player": s.current})
            s.current = self.next_player(s.current)
        return events

    # ---- Borrow (team mode) --------------------------------------------------
    def borrow_options(self):
        """Card kinds the current player may request from their teammate."""
        s = self.state
        if not self.is_team() or s.phase != "PLAY":
            return []
        p = s.current
        if not any(c.kind == "B" for c in s.hands[p]):
            return []
        q = self.mate(p)
        kinds = {c.kind for c in s.hands[q]}
        return [k for k in PLAY_KINDS if k in kinds]

    def request_borrow(self, kind):
        s = self.state
        if not self.is_team():
            return None, "Borrow is a team-mode card."
        if s.phase == "BORROW":
            return None, "A Borrow request is already waiting for an answer."
        if s.phase != "PLAY":
            return None, "You can only Borrow during your turn."
        p = s.current
        q = self.mate(p)
        if not any(c.kind == "B" for c in s.hands[p]):
            return None, f"{s.names[p]} has no Borrow card."
        if kind not in PLAY_KINDS:
            return None, "You can only request a gate or Measure card."
        if not any(c.kind == kind for c in s.hands[q]):
            return None, f"{s.names[q]} does not hold that card."
        s.discard.append(self._take(p, "B"))       # Borrow is consumed either way
        s.pending = {"from": p, "to": q, "kind": kind}
        s.phase = "BORROW"
        # History is public: it never names the requested card.
        self.history.add_note(f"{s.names[p]} plays BORROW: asks {s.names[q]} for a card")
        s.message = f"{s.names[q]}: accept or reject {s.names[p]}'s Borrow request."
        return [{"type": "borrow_request", "from": p, "to": q}], None

    def respond_borrow(self, accept):
        s = self.state
        if s.phase != "BORROW" or not s.pending:
            return None, "There is no Borrow request to answer."
        p, q, kind = s.pending["from"], s.pending["to"], s.pending["kind"]
        s.pending = None
        s.phase = "PLAY"
        if accept:
            card = self._take(q, kind)
            if card is not None:
                self.history.add_note(f"{s.names[q]} accepts: lends a card to {s.names[p]}")
                events = [{"type": "borrow_reply", "accept": True, "from": p, "to": q}]
                # The borrowed card is played at once as this turn's card.
                events += self._resolve(p, kind, card, lender=q)
                return events, None
        self.history.add_note(f"{s.names[q]} rejects the Borrow request")
        events = [{"type": "borrow_reply", "accept": False, "from": p, "to": q}]
        if not s.hands[p]:                     # only possible with an empty draw pile
            self.history.add_note(f"{s.names[p]} has no cards left - pass.")
            if self.is_over():
                return events + self._finish("cards"), None
            s.current = self.next_player(p)
            events += self._skip_empty_hands()
            if s.phase == "PLAY":
                self._turn_message()
            return events, None
        s.message = (f"Request rejected. {s.names[p]}: play a card from your own hand "
                     "(you cannot pass).")
        return events, None

    def can_discard_borrow(self):
        """PROTOTYPE RULE: only Borrow cards in hand and nothing to request."""
        s = self.state
        if not self.is_team() or s.phase != "PLAY":
            return False
        hand = s.hands[s.current]
        return bool(hand) and all(c.kind == "B" for c in hand) and not self.borrow_options()

    def discard_borrow(self):
        s = self.state
        if not self.can_discard_borrow():
            return None, "You still have a card you can play or request."
        p = s.current
        s.discard.append(self._take(p, "B"))
        self.history.add_note(f"{s.names[p]} discards a Borrow (nothing to request) - ball stays")
        before = s.position
        self._refill(p)
        events = [{"type": "dead_borrow", "player": p}]
        events += self._after_move(p, before)
        return events, None

    # ---- clock ---------------------------------------------------------------
    def tick(self, dt):
        """Advance the match clock. Returns True once time is up."""
        s = self.state
        if s.time_limit <= 0 or s.phase not in ACTIVE_PHASES or s.clock_paused:
            return False
        s.elapsed = min(s.time_limit, s.elapsed + max(0.0, dt))
        return s.elapsed >= s.time_limit

    def time_left(self):
        s = self.state
        return max(0.0, s.time_limit - s.elapsed) if s.time_limit > 0 else None

    def time_up(self):
        s = self.state
        if s.phase not in ACTIVE_PHASES:
            return None, "No game in progress."
        if s.pending:
            self.history.add_note("Time up: the Borrow request is cancelled")
            s.pending = None
        self.history.add_note("TIME UP")
        return [{"type": "time_up"}] + self._finish("time"), None

    # ---- end of game ---------------------------------------------------------
    def _finish(self, reason):
        s = self.state
        a, b = s.scores
        s.end_reason = {"target": "target score reached", "time": "time is up",
                        "cards": "all cards played", "manual": "game finished"}.get(reason, reason)
        if a == b and s.tie_break and QUANTUM_QUESTIONS:
            return self._start_challenge()
        s.phase = "GAME_OVER"
        if a == b:
            s.winner = -1
            res = f"Game over ({s.end_reason}): tie {a}-{b}"
        else:
            w = 0 if a > b else 1
            s.winner = w
            res = f"Game over ({s.end_reason}): {s.team_names[w]} wins {max(a, b)}-{min(a, b)}"
        s.result = s.message = res
        self.history.add_note(res)
        return [{"type": "game_over", "text": res}]

    def finish_physical(self):
        if self.state.phase not in ("PLAY", "KICKOFF"):
            return None, "No game in progress."
        return self._finish("manual"), None

    # ---- Quantum Challenge (tie-break) ---------------------------------------
    def _start_challenge(self):
        s = self.state
        order = list(range(len(QUANTUM_QUESTIONS)))
        self.rng.shuffle(order)
        s.challenge = {"order": order, "i": 0, "base": min(CHALLENGE_QUESTIONS, len(order)),
                       "scores": [0, 0], "locked": [False, False], "current": None,
                       "sudden": False, "log": []}
        s.phase = "CHALLENGE"
        self._next_question()
        a, b = s.scores
        self.history.add_note(f"Tie {a}-{b} ({s.end_reason}): QUANTUM CHALLENGE")
        s.message = (f"Tie {a}-{b}! Quantum Challenge: {s.challenge['base']} questions. "
                     "First team with the right answer scores.")
        return [{"type": "challenge_start"}]

    def _next_question(self):
        ch = self.state.challenge
        q = QUANTUM_QUESTIONS[ch["order"][ch["i"]]]
        ch["i"] += 1
        opts = list(enumerate(q["options"]))
        self.rng.shuffle(opts)
        ch["current"] = {"text": q["q"], "options": [o for _, o in opts],
                         "answer": [j for j, (k, _) in enumerate(opts) if k == q["answer"]][0],
                         "number": ch["i"]}
        ch["locked"] = [False, False]

    def answer_challenge(self, team, option):
        s = self.state
        ch = s.challenge
        if s.phase != "CHALLENGE" or ch is None:
            return None, "The Quantum Challenge is not running."
        if ch["locked"][team]:
            return None, f"{s.team_names[team]} already answered this question."
        q = ch["current"]
        if not 0 <= option < len(q["options"]):
            return None, "Invalid answer."
        n = q["number"]
        if option == q["answer"]:
            ch["scores"][team] += 1
            ch["log"].append(f"Q{n}: {s.team_names[team]} correct")
            events = [{"type": "challenge_answer", "team": team, "correct": True}]
            return events + self._challenge_advance(), None
        ch["locked"][team] = True
        events = [{"type": "challenge_answer", "team": team, "correct": False}]
        if all(ch["locked"]):
            ch["log"].append(f"Q{n}: both wrong - no point")
            return events + self._challenge_advance(), None
        s.message = (f"{s.team_names[team]} is wrong - "
                     f"{s.team_names[1 - team]} may answer Q{n}.")
        return events, None

    def skip_question(self):
        s = self.state
        if s.phase != "CHALLENGE":
            return None, "The Quantum Challenge is not running."
        ch = s.challenge
        ch["log"].append(f"Q{ch['current']['number']}: skipped - no point")
        return self._challenge_advance(), None

    def _challenge_advance(self):
        s = self.state
        ch = s.challenge
        a, b = ch["scores"]
        if ch["i"] >= ch["base"]:
            if a != b:
                return self._end_challenge()
            if s.sudden_death and ch["i"] < len(ch["order"]):
                ch["sudden"] = True
                self._next_question()
                s.message = f"Challenge tied {a}-{b}: sudden-death question!"
                return [{"type": "challenge_sudden"}]
            return self._end_challenge()
        self._next_question()
        s.message = f"Challenge {a}-{b}. Question {ch['i']} of {ch['base']}."
        return []

    def _end_challenge(self):
        s = self.state
        ch = s.challenge
        a, b = ch["scores"]
        m = s.scores[0]
        s.phase = "GAME_OVER"
        if a == b:
            s.winner = -1
            res = f"Draw: game {m}-{m}, Quantum Challenge {a}-{b}"
        else:
            w = 0 if a > b else 1
            s.winner = w
            res = (f"{s.team_names[w]} wins the Quantum Challenge {max(a, b)}-{min(a, b)} "
                   f"(game tied {m}-{m})")
        s.result = s.message = res
        self.history.add_note(res)
        return [{"type": "game_over", "text": res}]

    # ---- team chat -----------------------------------------------------------
    def send_chat(self, text):
        s = self.state
        if not self.is_team() or s.phase == "SETUP":
            return None, "Team chat is available in a team game."
        text = (text or "").strip()[:120]
        if not text:
            return None, "Type a message first."
        p = self.turn_player()
        if p is None:
            p = s.current
        s.chat[s.team_of[p]].append(f"{s.names[p]}: {text}")
        return [], None

    # ---- arrow controls ------------------------------------------------------
    def arrow_options(self, up=None, right=None):
        """direction -> (destination, card). Only cards the player may play now.

        AMBIGUOUS (5): arrows are not in the original game; they are only a
        shortcut for playing a card whose line points that way on screen.
        `up` / `right` are the screen directions projected onto the board
        (default: top view, + at the top). Identity and Measurement are never
        chosen by arrows.
        """
        s = self.state
        if s.phase != "PLAY" or s.position is None:
            return {}
        up = Vector((0, 1, 0)) if up is None else Vector(up)
        right = Vector((1, 0, 0)) if right is None else Vector(right)
        dirs = {"UP": up, "DOWN": -up, "LEFT": -right, "RIGHT": right}
        here = QUANTUM_STATES[s.position].board_xy()
        dests = {}
        for c in self.playable_cards():
            if c == "M":
                continue
            d = gate_destination(c, s.position)
            if d and d != s.position and d not in dests:
                dests[d] = c
        result = {}
        for name, vec in dirs.items():
            best, best_dot = None, 0.3
            for d, c in dests.items():
                dv = QUANTUM_STATES[d].board_xy() - here
                dot = dv.normalized().dot(vec)
                if dot > best_dot:
                    best, best_dot = (d, c), dot
            if best:
                result[name] = best
        return result


GAME = QuantumGame()


# =============================================================================
# SCENE HELPERS
# =============================================================================

def role_map():
    coll = bpy.data.collections.get(QUBIT_TOUCHDOWN_COLLECTION)
    if coll is None:
        return {}
    return {o["qt_role"]: o for o in coll.all_objects if o.get("qt_role")}


def link_obj(obj, coll, role):
    coll.objects.link(obj)
    obj["qt_generated"] = True
    obj["qt_role"] = role
    return obj


def set_hidden(obj, hidden):
    if obj is not None and obj.hide_viewport != hidden:
        obj.hide_viewport = hidden
        obj.hide_render = hidden


def safe_normalize(v, fallback=(0, 0, 1)):
    v = Vector(v)
    return v / v.length if v.length > 1e-12 else Vector(fallback)


def quat_from_z(v):
    z = Vector((0, 0, 1))
    v = safe_normalize(v)
    d = z.dot(v)
    if d > 1 - 1e-9:
        return Quaternion()
    if d < -1 + 1e-9:
        return Quaternion((1, 0, 0), math.pi)
    return z.rotation_difference(v)


def rotate_vector(v, axis, ang):
    """Rodrigues rotation (right-hand rule)."""
    k = safe_normalize(axis)
    v = Vector(v)
    c, s = math.cos(ang), math.sin(ang)
    return v * c + k.cross(v) * s + k * k.dot(v) * (1 - c)


def slerp(v0, v1, t):
    v0, v1 = safe_normalize(v0), safe_normalize(v1)
    d = max(-1.0, min(1.0, v0.dot(v1)))
    if d > 1 - 1e-9:
        return v0
    if d < -1 + 1e-9:
        p = Vector((1, 0, 0)) - v0 * v0.x
        p = p.normalized() if p.length > 1e-3 else Vector((0, 1, 0))
        return (v0 * math.cos(math.pi * t) + p * math.sin(math.pi * t)).normalized()
    w = math.acos(d)
    return (v0 * math.sin((1 - t) * w) + v1 * math.sin(t * w)).normalized()


def tag_redraw():
    try:
        for wm in bpy.data.window_managers:
            for win in wm.windows:
                for area in win.screen.areas:
                    if area.type == "VIEW_3D":
                        area.tag_redraw()
    except Exception:
        pass


def ensure_node_tree(idblock):
    """Blender 5.x always has node trees; 'use_nodes' is deprecated there."""
    if getattr(idblock, "node_tree", None) is None and hasattr(idblock, "use_nodes"):
        idblock.use_nodes = True
    return idblock.node_tree


def emission_material(name, rgb, strength=1.0):
    mat = bpy.data.materials.new(name)
    nt = ensure_node_tree(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "QT_Emission"
    em.inputs["Color"].default_value = (*rgb, 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def set_emission_strength(mat, strength):
    if mat and mat.node_tree:
        node = mat.node_tree.nodes.get("QT_Emission")
        if node:
            node.inputs["Strength"].default_value = strength


def gradient_material(name, c1, c2, length, strength):
    """Emission colour fades from c1 to c2 along the object's local X axis."""
    mat = bpy.data.materials.new(name)
    nt = ensure_node_tree(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "QT_Emission"
    em.inputs["Strength"].default_value = strength
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = max(length, 1e-3)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1.0)
    ramp.color_ramp.elements[1].color = (*c2, 1.0)
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs["X"], div.inputs[0])
    nt.links.new(div.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    mat.diffuse_color = ((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2, 1.0)
    return mat


def surface_material(name, rgb, roughness=0.5, emission=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    nt = ensure_node_tree(mat)
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    for names, val in ((["Base Color"], (*rgb, 1.0)), (["Roughness"], roughness),
                       (["Alpha"], alpha), (["Emission Color", "Emission"], (*rgb, 1.0)),
                       (["Emission Strength"], emission)):
        for n in names:
            if n in bsdf.inputs:
                try:
                    bsdf.inputs[n].default_value = val
                    break
                except Exception:
                    pass
    if alpha < 1.0:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = False
    mat.diffuse_color = (*rgb, alpha)
    return mat


def bm_add_frustum(bm, r0, r1, z0, z1, segments=24):
    ring0 = [bm.verts.new((r0 * math.cos(2 * math.pi * i / segments),
                           r0 * math.sin(2 * math.pi * i / segments), z0))
             for i in range(segments)]
    if r1 > 1e-9:
        ring1 = [bm.verts.new((r1 * math.cos(2 * math.pi * i / segments),
                               r1 * math.sin(2 * math.pi * i / segments), z1))
                 for i in range(segments)]
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        bm.faces.new(ring1)
    else:
        tip = bm.verts.new((0, 0, z1))
        for i in range(segments):
            bm.faces.new((ring0[i], ring0[(i + 1) % segments], tip))
    bm.faces.new(list(reversed(ring0)))


def mesh_object(name, bm, coll, role, mat=None, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    link_obj(obj, coll, role)
    if mat:
        me.materials.append(mat)
    return obj


def sphere_object(name, radius, coll, role, mat, u=32, v=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius)
    return mesh_object(name, bm, coll, role, mat, smooth=True)


def curve_object(name, coll, role, mat, bevel=0.02):
    cu = bpy.data.curves.new(name, type="CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = 3
    obj = bpy.data.objects.new(name, cu)
    link_obj(obj, coll, role)
    if mat:
        cu.materials.append(mat)
    return obj


def set_polylines(obj, lines, cyclic=False):
    cu = obj.data
    cu.splines.clear()
    for pts in lines:
        if len(pts) < 2:
            continue
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (p[0], p[1], p[2], 1.0)
        sp.use_cyclic_u = cyclic


def circle_points(r, z=0.0, n=96):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)
            for i in range(n)]


def text_object(name, body, loc, size, coll, role, mat, face_camera=None,
                align_x="CENTER", align_y="CENTER", parent=None):
    cu = bpy.data.curves.new(name, type="FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align_x
    cu.align_y = align_y
    obj = bpy.data.objects.new(name, cu)
    link_obj(obj, coll, role)
    if mat:
        cu.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = loc
    if face_camera is not None:          # billboard: same orientation as camera
        con = obj.constraints.new("COPY_ROTATION")
        con.target = face_camera
    return obj


# =============================================================================
# BOARD GENERATION
# =============================================================================

def cleanup_scene():
    """Remove only objects/data created by this script."""
    stop_animations()
    coll = bpy.data.collections.get(QUBIT_TOUCHDOWN_COLLECTION)
    if coll is not None:
        for obj in list(coll.all_objects):
            if not obj.get("qt_generated"):
                try:
                    bpy.context.scene.collection.objects.link(obj)
                except Exception:
                    pass
    for obj in [o for o in bpy.data.objects if o.get("qt_generated")]:
        bpy.data.objects.remove(obj, do_unlink=True)
    if coll is not None:
        bpy.data.collections.remove(coll)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.lights, bpy.data.cameras):
        for b in list(blocks):
            if b.name.startswith("QT_") and b.users == 0:
                blocks.remove(b)


def create_camera(scene, coll):
    cam = bpy.data.cameras.new("QT_Camera")
    cam.lens = 32
    cam.clip_start = 0.05
    cam.clip_end = 200
    obj = bpy.data.objects.new("QT_Camera", cam)
    link_obj(obj, coll, "CAMERA")
    loc, rot = camera_pose("OVERVIEW")
    obj.location = loc
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = rot
    scene.camera = obj
    return obj


def create_board_classic(coll, cam):
    board_mat = surface_material("QT_Mat_Board", COLORS["BOARD"], roughness=0.8, emission=0.05)
    bm = bmesh.new()
    bm_add_frustum(bm, BOARD_RADIUS, BOARD_RADIUS, -0.25, 0.0, segments=96)
    mesh_object("QT_Board", bm, coll, "BOARD", board_mat, smooth=False)

    rim = curve_object("QT_Board_Rim", coll, "RIM", emission_material("QT_Mat_Rim", COLORS["RIM"], 2.5), 0.045)
    set_polylines(rim, [circle_points(BOARD_RADIUS - 0.08, 0.01, 128)], cyclic=True)
    path = curve_object("QT_Board_Path", coll, "PATH",
                        emission_material("QT_Mat_Path", COLORS["GRID"], 0.35), 0.015)
    set_polylines(path, [circle_points(PATH_RADIUS, 0.012, 128)], cyclic=True)

    text_mat = emission_material("QT_Mat_Text", COLORS["TEXT"], 2.0)
    for key in STATE_ORDER:
        st = QUANTUM_STATES[key]
        pos = st.board_xy()
        col = COLORS[key]
        bm = bmesh.new()
        bm_add_frustum(bm, NODE_RADIUS, NODE_RADIUS * 0.96, 0.0, 0.14, segments=48)
        node = mesh_object(f"QT_Node_{st.label}", bm, coll, f"NODE_{key}",
                           emission_material(f"QT_Mat_Node_{key}", col, 1.6))
        node.location = pos
        ring = curve_object(f"QT_Ring_{st.label}", coll, f"RING_{key}",
                            emission_material(f"QT_Mat_Ring_{key}", col, 1.0), 0.035)
        set_polylines(ring, [circle_points(NODE_RADIUS + 0.17, 0.0, 64)], cyclic=True)
        ring.location = pos + Vector((0, 0, 0.06))
        sym = {"0": "0", "1": "1", "+": "+", "-": "-", "i": "i", "-i": "-i"}[key]
        text_object(f"QT_Symbol_{key}", sym, pos + Vector((0, 0, 0.16)), 0.9,
                    coll, f"SYMBOL_{key}", text_mat)
        outward = Vector((math.cos(st.board_angle), math.sin(st.board_angle), 0))
        label = st.label
        if key in ENDZONE_TEAM:
            label = f"{st.label}  ENDZONE"
            ez = curve_object(f"QT_Endzone_{key}", coll, f"ENDZONE_{key}",
                              emission_material(f"QT_Mat_Endzone_{key}", col, 3.0), 0.05)
            set_polylines(ez, [circle_points(NODE_RADIUS + 0.42, 0.0, 64)], cyclic=True)
            ez.location = pos + Vector((0, 0, 0.04))
        text_object(f"QT_Label_{key}", label, pos + outward * 1.45 + Vector((0, 0, 0.5)),
                    0.3, coll, f"LABEL_{key}",
                    emission_material(f"QT_Mat_Label_{key}", col, 2.5), face_camera=cam)



def create_board_orbit(coll, cam):
    """Reference-style board: floating half-sphere characters with eyes, a
    swirling orbit of thin coloured lines, no solid table."""
    z0 = STYLE["node_z"]
    palette = [COLORS[k] for k in STATE_ORDER] + [(1, 1, 1), COLORS["GOLD"], COLORS["RIM"]]
    swirl_mats = [fade_emission_material(f"QT_Mat_Swirl_{i}", c, 1.0) for i, c in enumerate(palette)]
    layers = []
    for li, suffix in enumerate(("", "_B", "_C")):     # 3 layers flow at different speeds
        layer = curve_object(f"QT_Orbit_Swirl{suffix}", coll, f"SWIRL_{li}", None, 0.006)
        for m in swirl_mats:
            layer.data.materials.append(m)
        layer.data.splines.clear()
        layers.append(layer)
    rng = random.Random(11)
    n_pts = 160
    for k in range(57):
        cu = layers[k % 3].data
        r0 = PATH_RADIUS + rng.gauss(0.0, 0.5)
        a1, a2, a3 = rng.uniform(0.1, 0.5), rng.uniform(0.05, 0.25), rng.uniform(0.0, 0.15)
        p1, p2, p3, p4 = (rng.uniform(0, 2 * math.pi) for _ in range(4))
        zamp, zf = rng.uniform(0.1, 0.7), rng.choice((1, 2, 3))
        sp = cu.splines.new("POLY")
        sp.points.add(n_pts - 1)
        for i in range(n_pts):
            t = 2 * math.pi * i / n_pts
            r = r0 + a1 * math.sin(2 * t + p1) + a2 * math.sin(5 * t + p2) + a3 * math.sin(9 * t + p3)
            sp.points[i].co = (r * math.cos(t), r * math.sin(t), z0 + zamp * math.sin(zf * t + p4), 1.0)
        sp.use_cyclic_u = True
        sp.material_index = rng.randrange(len(palette))

    eye_mat = emission_material("QT_Mat_Eyes", (1, 1, 1), 5.0)
    for n, key in enumerate(STATE_ORDER):
        st = QUANTUM_STATES[key]
        pos = st.board_xy()
        col = COLORS[key]
        # Half-sphere ("dome") character.
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=DOME_RADIUS)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context="VERTS")
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
        dome = mesh_object(f"QT_Dome_{st.label}", bm, coll, f"NODE_{key}",
                           emission_material(f"QT_Mat_Node_{key}", col, 1.0), smooth=True)
        dome.location = pos + Vector((0, 0, z0))
        # Gentle floating bob while the timeline plays (simple expression, no Python needed).
        fc = dome.driver_add("location", 2)
        fc.driver.type = "SCRIPTED"
        fc.driver.expression = f"{z0:.3f} + 0.06*sin(frame/16 + {n * 1.1:.2f})"
        # Eyes always face the camera.
        pivot = bpy.data.objects.new(f"QT_EyePivot_{key}", None)
        link_obj(pivot, coll, f"EYEPIVOT_{key}")
        pivot.empty_display_size = 0.05
        pivot.parent = dome
        pivot.location = (0, 0, 0.28)
        con = pivot.constraints.new("COPY_ROTATION")
        con.target = cam
        for side in (-1, 1):
            eye = sphere_object(f"QT_Eye_{key}_{'L' if side < 0 else 'R'}", 1.0, coll,
                                f"EYE_{key}_{side}", eye_mat, 16, 8)
            eye.parent = pivot
            eye.location = (0.17 * side, 0.04, 0.74)
            eye.scale = (0.055, 0.13, 0.03)
            eye.rotation_euler = (0, 0, -0.3 * side)
            # "> <" eyes shown when something sits on the character's head.
            bm = bmesh.new()
            tip = 1 if side < 0 else -1               # left eye '>', right eye '<'
            for sgn in (1, -1):
                p0, p1 = Vector((-tip * 0.06, sgn * 0.065, 0)), Vector((tip * 0.05, 0, 0))
                mid, ln = (p0 + p1) / 2, (p1 - p0).length
                ang = math.atan2(p1.y - p0.y, p1.x - p0.x)
                m = (Matrix.Translation(mid) @ Matrix.Rotation(ang, 4, "Z")
                     @ Matrix.Diagonal((ln / 2 + 0.02, 0.028, 0.025, 1.0)))
                bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0, matrix=m)
            hurt = mesh_object(f"QT_EyeHurt_{key}_{'L' if side < 0 else 'R'}", bm, coll,
                               f"EYEHURT_{key}_{side}", eye_mat, smooth=True)
            hurt.parent = pivot
            hurt.location = (0.17 * side, 0.04, 0.74)
            set_hidden(hurt, True)
        ring = curve_object(f"QT_Ring_{st.label}", coll, f"RING_{key}",
                            emission_material(f"QT_Mat_Ring_{key}", col, 1.0), 0.03)
        set_polylines(ring, [circle_points(DOME_RADIUS + 0.2, 0.0, 64)], cyclic=True)
        ring.location = pos + Vector((0, 0, z0 + 0.01))
        outward = Vector((math.cos(st.board_angle), math.sin(st.board_angle), 0))
        label = st.label
        if key in ENDZONE_TEAM:
            label = f"{st.label}  ENDZONE"
            ez = curve_object(f"QT_Endzone_{key}", coll, f"ENDZONE_{key}",
                              emission_material(f"QT_Mat_Endzone_{key}", col, 3.0), 0.045)
            set_polylines(ez, [circle_points(DOME_RADIUS + 0.45, 0.0, 64)], cyclic=True)
            ez.location = pos + Vector((0, 0, z0 - 0.02))
        text_object(f"QT_Label_{key}", label, pos + outward * 1.35 + Vector((0, 0, z0 - 0.1)),
                    0.32, coll, f"LABEL_{key}",
                    emission_material(f"QT_Mat_Label_{key}", col, 3.0), face_camera=cam)


def create_edges(coll, cam):
    """Lines and arrows of the board, derived from the gate matrices."""
    z0 = STYLE["node_z"]
    label_mat = emission_material("QT_Mat_Gate_Label", COLORS["TEXT"], 2.2)
    for n, e in enumerate(board_edges()):
        a_pos = QUANTUM_STATES[e["a"]].board_xy()
        b_pos = QUANTUM_STATES[e["b"]].board_xy()
        d = (b_pos - a_pos)
        direction = d.normalized()
        start = a_pos + direction * (NODE_RADIUS + 0.12)
        end = b_pos - direction * (NODE_RADIUS + 0.12)
        length = (end - start).length
        ca, cb = COLORS[e["a"]], COLORS[e["b"]]
        mat = gradient_material(f"QT_Mat_Edge_{n}", ca, cb, length, 1.0)
        obj = curve_object(f"QT_Edge_{e['a']}_{e['b']}", coll, f"EDGE_{n}", mat, 0.04)
        set_polylines(obj, [[(0, 0, 0), (length, 0, 0)]])
        obj.location = start + Vector((0, 0, z0 + 0.05))
        obj.rotation_euler = (0, 0, math.atan2(direction.y, direction.x))
        obj["qt_from"], obj["qt_to"] = e["a"], e["b"]
        obj["qt_directed"] = e["directed"]
        obj["qt_gates"] = ",".join(e["gates"])
        if e["directed"]:
            bm = bmesh.new()
            bm_add_frustum(bm, 0.17, 0.0, 0.0, 0.42, segments=16)
            bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0),
                             matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
            head = mesh_object(f"QT_Arrow_{e['a']}_{e['b']}", bm, coll, f"ARROW_{n}",
                               emission_material(f"QT_Mat_Arrow_{n}", cb, 2.0))
            head.parent = obj
            head.location = (length - 0.42, 0, 0)
        # Gate label (lines through the centre are labelled near one end, as on the diagram)
        through_center = (a_pos + b_pos).length < 0.5
        if through_center:
            near = a_pos if a_pos.y >= b_pos.y else b_pos
            far = b_pos if near is a_pos else a_pos
            lp = near + (far - near) * 0.28
        else:
            lp = (a_pos + b_pos) * 0.5
            lp += Vector((lp.x, lp.y, 0)).normalized() * 0.35 if lp.length > 0.1 else Vector()
        text_object(f"QT_GateLabel_{n}", ", ".join(CARD_LABEL[g] if g != "SX" else "sqrtX"
                                                   for g in e["gates"]),
                    lp + Vector((0, 0, z0 + 0.45)), 0.3, coll, f"GATELABEL_{n}", label_mat,
                    face_camera=cam)


# =============================================================================
# BLOCH SPHERE
# =============================================================================

def create_bloch_sphere(coll, cam):
    """Floating Bloch sphere above the board centre. Its +X (|+>) axis points to
    the board's + position so the sphere and the board read the same way."""
    root = bpy.data.objects.new("QT_Bloch_Root", None)
    link_obj(root, coll, "BLOCH_ROOT")
    root.empty_display_size = 0.2
    root.location = BLOCH_CENTER
    root.rotation_euler = (0, 0, math.pi / 2)
    root.empty_display_type = "SPHERE"
    root.empty_display_size = BLOCH_RADIUS * 1.05

    glass = surface_material("QT_Mat_Bloch_Glass", COLORS["SPHERE"], 0.2, 0.25, alpha=0.16)
    sph = sphere_object("QT_Bloch_Sphere", BLOCH_RADIUS, coll, "BLOCH_SPHERE", glass, 48, 24)
    sph.parent = root
    sph.show_transparent = True

    grid = curve_object("QT_Bloch_Grid", coll, "BLOCH_GRID",
                        emission_material("QT_Mat_Bloch_Grid", COLORS["GRID"], 0.8), 0.006)
    lines = []
    for th in (45, 90, 135):
        r, z = BLOCH_RADIUS * math.sin(math.radians(th)), BLOCH_RADIUS * math.cos(math.radians(th))
        lines.append(circle_points(r, z, 72))
    for ph in (0, 45, 90, 135):
        p = math.radians(ph)
        lines.append([(BLOCH_RADIUS * math.sin(t) * math.cos(p), BLOCH_RADIUS * math.sin(t) * math.sin(p),
                       BLOCH_RADIUS * math.cos(t)) for t in [2 * math.pi * i / 72 for i in range(72)]])
    set_polylines(grid, lines, cyclic=True)
    grid.parent = root

    axis_mat = emission_material("QT_Mat_Bloch_Axes", COLORS["TEXT"], 1.2)
    axes = curve_object("QT_Bloch_Axes", coll, "BLOCH_AXES", axis_mat, 0.012)
    L = BLOCH_RADIUS * 1.18
    set_polylines(axes, [[(-L, 0, 0), (L, 0, 0)], [(0, -L, 0), (0, L, 0)], [(0, 0, -L), (0, 0, L)]])
    axes.parent = root

    for key in STATE_ORDER:
        st = QUANTUM_STATES[key]
        v = Vector(st.bloch)
        dot = sphere_object(f"QT_Bloch_Dot_{key}", 0.07, coll, f"BLOCH_DOT_{key}",
                            emission_material(f"QT_Mat_Bloch_Dot_{key}", COLORS[key], 4.0), 16, 8)
        dot.parent = root
        dot.location = v * BLOCH_RADIUS
        text_object(f"QT_Bloch_Label_{key}", st.label, v * (BLOCH_RADIUS + 0.33), 0.24,
                    coll, f"BLOCH_LABEL_{key}",
                    emission_material(f"QT_Mat_Bloch_Label_{key}", COLORS[key], 3.0),
                    face_camera=cam, parent=root)

    bm = bmesh.new()
    bm_add_frustum(bm, 0.035, 0.035, 0.0, 0.84, 16)
    bm_add_frustum(bm, 0.09, 0.0, 0.84, 1.0, 20)
    arrow = mesh_object("QT_Bloch_Vector", bm, coll, "BLOCH_VECTOR",
                        emission_material("QT_Mat_Bloch_Vector", COLORS["VECTOR"], 4.0))
    arrow.parent = root
    arrow.rotation_mode = "QUATERNION"
    arrow.scale = (BLOCH_RADIUS, BLOCH_RADIUS, BLOCH_RADIUS)
    tip = sphere_object("QT_Bloch_Tip", 0.1, coll, "BLOCH_TIP",
                        emission_material("QT_Mat_Bloch_Tip", COLORS["GOLD"], 8.0), 16, 8)
    tip.parent = root

    # Visual tie between the floating sphere and the board.
    beam_mat = emission_material("QT_Mat_Beam", COLORS["RIM"], 0.8)
    bm = bmesh.new()
    bm_add_frustum(bm, 0.03, 0.03, 0.0, 1.0, 12)          # unit height, scaled to fit
    mesh_object("QT_Bloch_Beam", bm, coll, "BLOCH_BEAM", beam_mat)
    pad = curve_object("QT_Bloch_Pad", coll, "BLOCH_PAD",
                       emission_material("QT_Mat_Pad", COLORS["RIM"], 1.5), 0.03)
    set_polylines(pad, [circle_points(1.25, 0.0, 64), circle_points(0.8, 0.0, 64)], cyclic=True)


def apply_bloch_transform(scene):
    """Move/scale the floating sphere from the panel values."""
    p = scene.qt_props
    root = role_map().get("BLOCH_ROOT")
    if root is None:
        return
    root.location = (p.bloch_x, p.bloch_y, p.bloch_z)
    root.scale = (p.bloch_size, p.bloch_size, p.bloch_size)
    sync_bloch_links(scene)


def sync_bloch_links(scene=None):
    """Keep the beam and floor pad under the sphere (also after moving it with G)
    and mirror a hand-dragged position back into the panel sliders."""
    objs = role_map()
    root = objs.get("BLOCH_ROOT")
    if root is None:
        return
    loc, s = root.location, root.scale.x
    floor = STYLE["node_z"] if STYLE["name"] == "ORBIT" else 0.0
    h = max(0.01, loc.z - BLOCH_RADIUS * s - floor)
    beam, pad = objs.get("BLOCH_BEAM"), objs.get("BLOCH_PAD")
    if beam and ((beam.location - Vector((loc.x, loc.y, floor))).length > 1e-5
                 or abs(beam.scale.z - h) > 1e-5):
        beam.location = (loc.x, loc.y, floor)
        beam.scale = (1.0, 1.0, h)
    if pad and (pad.location - Vector((loc.x, loc.y, floor + 0.02))).length > 1e-5:
        pad.location = (loc.x, loc.y, floor + 0.02)
    if scene is not None and hasattr(scene, "qt_props"):
        p = scene.qt_props
        for name, val in (("bloch_x", loc.x), ("bloch_y", loc.y), ("bloch_z", loc.z), ("bloch_size", s)):
            if abs(getattr(p, name) - val) > 1e-4:
                p[name] = val           # write without triggering the update callback


_SYNCING = [False]


def _qt_depsgraph_handler(scene, depsgraph=None):
    if _SYNCING[0]:
        return
    _SYNCING[0] = True
    try:
        sync_bloch_links(scene)
        update_minimap()
    except Exception:
        pass
    finally:
        _SYNCING[0] = False


# =============================================================================
# GAME TOKEN
# =============================================================================

TOKEN_SHAPE = ["FOOTBALL"]
TOKEN_BASE_SCALE = {"FOOTBALL": (0.46, 0.29, 0.29), "HEART": (1.0, 1.0, 1.0),
                    "STAR": (1.0, 1.0, 1.0)}


def build_token_mesh(shape):
    """Football (original), puffy heart, or 3D star - all about the same size."""
    bm = bmesh.new()
    smooth = True
    if shape == "HEART":
        squash = Matrix.Diagonal((1.0, 0.62, 1.0, 1.0))
        for sx in (-1, 1):
            bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.19,
                                      matrix=Matrix.Translation((0.14 * sx, 0, 0.08)) @ squash)
        before = set(bm.verts)
        bm_add_frustum(bm, 0.30, 0.0, 0.10, -0.33, segments=24)      # tip points down
        for v in bm.verts:
            if v not in before:
                v.co.y *= 0.62
    elif shape == "STAR":
        smooth = False
        ring = []
        for k in range(10):
            ang = math.pi / 2 + k * math.pi / 5
            r = 0.40 if k % 2 == 0 else 0.17
            ring.append(bm.verts.new((r * math.cos(ang), 0.0, r * math.sin(ang))))
        front, back = bm.verts.new((0, -0.15, 0)), bm.verts.new((0, 0.15, 0))
        for k in range(10):
            j = (k + 1) % 10
            bm.faces.new((front, ring[k], ring[j]))
            bm.faces.new((back, ring[j], ring[k]))
    else:
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(f"QT_Token_{shape.title()}")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return me


def token_material(shape):
    name = {"FOOTBALL": "QT_Mat_Football", "HEART": "QT_Mat_Heart", "STAR": "QT_Mat_Star"}[shape]
    mat = bpy.data.materials.get(name)
    if mat is None:
        if shape == "HEART":
            mat = surface_material(name, (1.0, 0.18, 0.42), 0.3, emission=1.2)
        elif shape == "STAR":
            mat = surface_material(name, (1.0, 0.80, 0.25), 0.3, emission=1.5)
        else:
            mat = surface_material(name, (0.45, 0.18, 0.06), 0.45, emission=0.25)
    return mat


def apply_token_shape(shape):
    tok = role_map().get("TOKEN")
    TOKEN_SHAPE[0] = shape
    if tok is None:
        return
    old = tok.data
    tok.data = build_token_mesh(shape)
    tok.data.materials.append(token_material(shape))
    tok.scale = TOKEN_BASE_SCALE[shape]
    if old is not None and old.users == 0:
        bpy.data.meshes.remove(old)
    _show_token(not tok.hide_viewport)
    place_token(tok.location.copy())


def face_camera_angle(pos):
    cam = role_map().get("CAMERA")
    if cam is None:
        return 0.0
    d = cam.location - Vector(pos)
    return math.atan2(d.x, -d.y)


def create_token(coll):
    tok = bpy.data.objects.new("QT_Token", build_token_mesh("FOOTBALL"))
    link_obj(tok, coll, "TOKEN")
    tok.data.materials.append(token_material("FOOTBALL"))
    tok.scale = (0.46, 0.29, 0.29)
    tok.location = (0, 0, STYLE["token_h"])
    lace_mat = emission_material("QT_Mat_Laces", (1, 1, 1), 2.5)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    lace = mesh_object("QT_Token_Laces", bm, coll, "TOKEN_LACES", lace_mat)
    lace.parent = tok
    lace.location = (0, 0, 0.97)
    lace.scale = (0.55, 0.09, 0.06)
    glow = curve_object("QT_Token_Glow", coll, "TOKEN_GLOW",
                        emission_material("QT_Mat_Token_Glow", COLORS["GOLD"], 3.0), 0.03)
    set_polylines(glow, [circle_points(0.55, 0.0, 48)], cyclic=True)
    glow.location = (0, 0, STYLE["token_h"] - 0.25)


def create_hud(coll, cam):
    """Score / state texts attached to the camera so they work in every view."""
    mat = emission_material("QT_Mat_HUD", COLORS["TEXT"], 2.0)
    gold = emission_material("QT_Mat_HUD_Gold", COLORS["GOLD"], 3.0)
    d = -6.0
    # Top-left corner holds the minimap; the score text sits just below it.
    text_object("QT_HUD_Score", "", (-3.28, 0.80, d), 0.13, coll, "HUD_SCORE", mat,
                align_x="LEFT", align_y="TOP", parent=cam)
    text_object("QT_HUD_State", "", (3.0, 1.62, d), 0.15, coll, "HUD_STATE", mat,
                align_x="RIGHT", align_y="TOP", parent=cam)
    text_object("QT_HUD_Message", "", (0.0, -1.66, d), 0.13, coll, "HUD_MESSAGE", mat,
                align_x="CENTER", align_y="CENTER", parent=cam)
    text_object("QT_HUD_Banner", "", (0.0, -1.28, d), 0.22, coll, "HUD_BANNER", gold,
                align_x="CENTER", align_y="CENTER", parent=cam)


# ---------------------------- minimap (top-left) ------------------------------
# A small map of the six positions, attached to the camera. It is drawn the way
# the current camera sees the board (it turns when the camera turns), and the
# gold dot follows the football, including during its hop animation.

MINI_CENTER = Vector((-2.84, 1.37, -6.0))   # camera space, same depth as the HUD
MINI_R = 0.34                              # radius of the position circle
MINI_BG_R = MINI_R * 1.42
_MINI = {"basis": None}
_EDGE_CACHE = []


def cached_edges():
    if not _EDGE_CACHE:
        _EDGE_CACHE.extend(board_edges())
    return _EDGE_CACHE


def create_minimap(coll, cam):
    root = bpy.data.objects.new("QT_Minimap", None)
    link_obj(root, coll, "MINIMAP")
    root.empty_display_size = 0.05
    root.parent = cam
    root.location = MINI_CENTER
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=MINI_BG_R)
    bg = mesh_object("QT_Mini_BG", bm, coll, "MINI_BG",
                     emission_material("QT_Mat_Mini_BG", (0.008, 0.012, 0.03), 1.0))
    bg.parent = root
    bg.location = (0, 0, -0.03)
    rim = curve_object("QT_Mini_Rim", coll, "MINI_RIM",
                       emission_material("QT_Mat_Mini_Rim", COLORS["RIM"], 2.0), 0.006)
    set_polylines(rim, [circle_points(MINI_BG_R, 0.0, 64)], cyclic=True)
    rim.parent = root
    path = curve_object("QT_Mini_Path", coll, "MINI_PATH",
                        emission_material("QT_Mat_Mini_Path", COLORS["GRID"], 0.45), 0.003)
    set_polylines(path, [circle_points(MINI_R, -0.01, 64)], cyclic=True)
    path.parent = root
    edges = curve_object("QT_Mini_Edges", coll, "MINI_EDGES",
                         emission_material("QT_Mat_Mini_Edges", COLORS["GRID"], 1.0), 0.0035)
    edges.parent = root
    for key in STATE_ORDER:
        dot = sphere_object(f"QT_Mini_Dot_{key}", 0.04, coll, f"MINI_DOT_{key}",
                            emission_material(f"QT_Mat_Mini_Dot_{key}", COLORS[key], 2.5), 16, 8)
        dot.parent = root
        text_object(f"QT_Mini_Label_{key}", key, (0, 0, 0), 0.075, coll, f"MINI_LABEL_{key}",
                    emission_material(f"QT_Mat_Mini_Label_{key}", COLORS[key], 3.0), parent=root)
    for key in ENDZONE_TEAM:
        ez = curve_object(f"QT_Mini_EZ_{key}", coll, f"MINI_EZ_{key}",
                          emission_material(f"QT_Mat_Mini_EZ_{key}", COLORS[key], 3.0), 0.005)
        set_polylines(ez, [circle_points(0.075, 0.0, 32)], cyclic=True)
        ez.parent = root
    tok = sphere_object("QT_Mini_Token", 0.03, coll, "MINI_TOKEN",
                        emission_material("QT_Mat_Mini_Token", COLORS["GOLD"], 8.0), 16, 8)
    tok.parent = root
    _MINI["basis"] = None


def _set_loc(obj, v):
    if obj is not None and (obj.location - Vector(v)).length > 1e-6:
        obj.location = v


def _set_uniform_scale(obj, k):
    if obj is not None and abs(obj.scale.x - k) > 1e-6:
        obj.scale = (k, k, k)


def _mini_xy(p, up, right, z=0.0):
    k = MINI_R / PATH_RADIUS
    return Vector(((p.x * right.x + p.y * right.y) * k, (p.x * up.x + p.y * up.y) * k, z))


def update_minimap(objs=None):
    """Lay the minimap out for the current camera and move the gold ball dot.
    Writes only values that changed, so it is safe to call from the depsgraph handler."""
    objs = objs or role_map()
    if "MINIMAP" not in objs:
        return
    up, right = view_basis(objs)
    key = (round(up.x, 4), round(up.y, 4), round(right.x, 4), round(right.y, 4))
    if key != _MINI["basis"]:
        _MINI["basis"] = key
        for k in STATE_ORDER:
            m = _mini_xy(QUANTUM_STATES[k].board_xy(), up, right)
            _set_loc(objs.get(f"MINI_DOT_{k}"), m + Vector((0, 0, 0.005)))
            out = Vector((m.x, m.y, 0)).normalized() if m.length > 1e-6 else Vector()
            _set_loc(objs.get(f"MINI_LABEL_{k}"), m + out * 0.11 + Vector((0, 0, 0.005)))
            if k in ENDZONE_TEAM:
                _set_loc(objs.get(f"MINI_EZ_{k}"), m)
        edges = objs.get("MINI_EDGES")
        if edges is not None:
            lines = []
            for e in cached_edges():
                a = _mini_xy(QUANTUM_STATES[e["a"]].board_xy(), up, right)
                b = _mini_xy(QUANTUM_STATES[e["b"]].board_xy(), up, right)
                lines.append([tuple(a), tuple(b)])
            set_polylines(edges, lines)
    pos = GAME.state.position
    for k in STATE_ORDER:
        _set_uniform_scale(objs.get(f"MINI_DOT_{k}"), 1.6 if k == pos else 1.0)
    update_minimap_token(objs, up, right)


def update_minimap_token(objs=None, up=None, right=None):
    objs = objs or role_map()
    mk, tok = objs.get("MINI_TOKEN"), objs.get("TOKEN")
    if mk is None:
        return
    if tok is None or tok.hide_viewport:
        set_hidden(mk, True)
        return
    set_hidden(mk, False)
    if up is None:
        up, right = view_basis(objs)
    _set_loc(mk, _mini_xy(tok.location, up, right, 0.03))


def create_lighting(scene, coll):
    if any(o.type == "LIGHT" and not o.get("qt_generated") for o in scene.objects):
        return
    for name, loc, energy, size in (("QT_Key_Light", Vector((6, -6, 10)), 900, 8),
                                    ("QT_Fill_Light", Vector((-7, 5, 6)), 300, 10)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size = energy, size
        obj = bpy.data.objects.new(name, data)
        link_obj(obj, coll, name)
        obj.location = loc
        obj.rotation_euler = (-loc).to_track_quat("-Z", "Y").to_euler()


def set_vivid_colors(scene, vivid):
    """Orbit style uses the 'Standard' view transform so glowing colours stay
    saturated (AgX/Filmic wash them out). The previous setting is restored for Classic."""
    vs = scene.view_settings
    if vivid:
        if "qt_prev_view_transform" not in scene and vs.view_transform != "Standard":
            scene["qt_prev_view_transform"] = vs.view_transform
        try:
            vs.view_transform = "Standard"
        except Exception:
            pass
    elif "qt_prev_view_transform" in scene:
        try:
            vs.view_transform = scene["qt_prev_view_transform"]
        except Exception:
            pass
        del scene["qt_prev_view_transform"]


def build_scene(scene):
    cleanup_scene()
    coll = bpy.data.collections.new(QUBIT_TOUCHDOWN_COLLECTION)
    scene.collection.children.link(coll)
    apply_style(scene.qt_props.style)
    cam = create_camera(scene, coll)
    if STYLE["name"] == "ORBIT":
        create_board_orbit(coll, cam)
    else:
        create_board_classic(coll, cam)
    create_edges(coll, cam)
    create_bloch_sphere(coll, cam)
    create_token(coll)
    apply_token_shape(scene.qt_props.token_shape)
    create_hud(coll, cam)
    create_minimap(coll, cam)
    create_lighting(scene, coll)
    set_vivid_colors(scene, STYLE["name"] == "ORBIT")
    if STYLE["name"] == "ORBIT":
        build_space_world(scene)              # Milky Way sky for the orbit style
    elif scene.world is None:
        w = bpy.data.worlds.new("QT_World")
        nt = ensure_node_tree(w)
        bg = nt.nodes.get("Background") if nt else None
        if bg:
            bg.inputs["Color"].default_value = (0.005, 0.006, 0.012, 1)
        scene.world = w
    apply_bloch_transform(scene)
    apply_swirl_look(scene)
    sync_visuals()


# =============================================================================
# ANIMATION
# =============================================================================

_ANIM = {"queue": [], "current": None, "t0": 0.0, "cam": None}


def anim_busy():
    return bool(_ANIM["queue"]) or _ANIM["current"] is not None


def enqueue(duration, step, done=None):
    _ANIM["queue"].append((max(0.01, duration), step, done))
    ensure_timer()


def ensure_timer():
    fn = bpy.app.driver_namespace.get("qt_anim_tick")
    if fn is not _anim_tick:
        try:
            if fn and bpy.app.timers.is_registered(fn):
                bpy.app.timers.unregister(fn)
        except Exception:
            pass
    if not bpy.app.timers.is_registered(_anim_tick):
        bpy.app.timers.register(_anim_tick, first_interval=0.0)
    bpy.app.driver_namespace["qt_anim_tick"] = _anim_tick


def _anim_tick():
    try:
        now = time.perf_counter()
        # Camera channel (independent of the game queue).
        cam_job = _ANIM["cam"]
        if cam_job:
            t = min(1.0, (now - cam_job["t0"]) / cam_job["dur"])
            e = t * t * (3 - 2 * t)
            obj = role_map().get("CAMERA")
            if obj:
                obj.location = cam_job["l0"].lerp(cam_job["l1"], e)
                obj.rotation_quaternion = cam_job["q0"].slerp(cam_job["q1"], e)
                update_minimap()              # the map turns with the camera
            if t >= 1.0:
                _ANIM["cam"] = None
        # Game channel: run queued steps one after another.
        while True:
            if _ANIM["current"] is None:
                if not _ANIM["queue"]:
                    break
                _ANIM["current"] = _ANIM["queue"].pop(0)
                _ANIM["t0"] = now
            dur, step, done = _ANIM["current"]
            t = min(1.0, (now - _ANIM["t0"]) / dur)
            if step:
                step(t)
            if t < 1.0:
                break
            if done:
                done()
            _ANIM["current"] = None
            _ANIM["t0"] = now
        tag_redraw()
        if _ANIM["cam"] or anim_busy():
            return 1.0 / 60.0
        sync_visuals()
        tag_redraw()
        return None
    except Exception:
        traceback.print_exc()
        _ANIM["queue"].clear()
        _ANIM["current"] = None
        _ANIM["cam"] = None
        return None


def stop_animations():
    _ANIM["queue"].clear()
    _ANIM["current"] = None
    _ANIM["cam"] = None
    for fn in (bpy.app.driver_namespace.get("qt_anim_tick"), _anim_tick):
        try:
            if fn and bpy.app.timers.is_registered(fn):
                bpy.app.timers.unregister(fn)
        except Exception:
            pass


def anim_duration():
    try:
        return 1.0 / max(0.25, bpy.context.scene.qt_props.anim_speed)
    except Exception:
        return 1.0


def node_pos(key, height=None):
    height = STYLE["token_h"] if height is None else height
    if key is None:
        return Vector((0, 0, height))
    return QUANTUM_STATES[key].board_xy() + Vector((0, 0, height))


def set_bloch_vector(v):
    objs = role_map()
    arrow, tip = objs.get("BLOCH_VECTOR"), objs.get("BLOCH_TIP")
    v = safe_normalize(v)
    if arrow:
        arrow.rotation_quaternion = quat_from_z(v)
    if tip:
        tip.location = v * BLOCH_RADIUS


def place_token(pos, yaw=None, spin=0.0):
    objs = role_map()
    tok, glow = objs.get("TOKEN"), objs.get("TOKEN_GLOW")
    if tok:
        tok.location = pos
        if TOKEN_SHAPE[0] != "FOOTBALL":          # heart / star face the camera
            tok.rotation_euler = (0.0, 0.0, face_camera_angle(pos) + spin)
        elif yaw is not None:
            tok.rotation_euler = (0.0, 0.0, yaw + spin)
    if glow:
        glow.location = (pos.x, pos.y, pos.z - 0.25)
    update_minimap_token(objs)


def set_banner(text):
    b = role_map().get("HUD_BANNER")
    if b:
        b.data.body = text


def hop_step(p0, p1, height, v0=None, v1_fn=None):
    yaw = math.atan2(p1.y - p0.y, p1.x - p0.x) if (p1 - p0).length > 1e-4 else None

    def step(t):
        e = t * t * (3 - 2 * t)
        place_token(p0.lerp(p1, e) + Vector((0, 0, height * math.sin(math.pi * t))), yaw)
        if v1_fn:
            set_bloch_vector(v1_fn(e))
    return step


def animate_events(events):
    """Turn game events into queued animations (token + Bloch vector in sync)."""
    D = anim_duration()
    for ev in events:
        kind = ev["type"]
        if kind == "gate":
            p0, p1 = node_pos(ev["from"]), node_pos(ev["to"])
            v0 = Vector(QUANTUM_STATES[ev["from"]].bloch)
            axis, ang = GATE_ROTATIONS[ev["card"]]
            card = ev["card"]
            label = (f"{CARD_ASCII[card]}:  {QUANTUM_STATES[ev['from']].label}  ->  "
                     f"{QUANTUM_STATES[ev['to']].label}")
            enqueue(0.01, None, lambda l=label: set_banner(l))
            enqueue(D, hop_step(p0, p1, 1.1 if ev["from"] != ev["to"] else 0.35,
                                v1_fn=lambda e, v0=v0, axis=axis, ang=ang: rotate_vector(v0, axis, ang * e)))
        elif kind == "measure":
            p0, p1 = node_pos(ev["from"]), node_pos(ev["to"])
            v0 = Vector(QUANTUM_STATES[ev["from"]].bloch)
            v1 = Vector(QUANTUM_STATES[ev["to"]].bloch)
            head = (f"MEASUREMENT   P(0)={100 * ev['p0']:.0f}%  P(1)={100 * ev['p1']:.0f}%")
            enqueue(0.01, None, lambda h=head: set_banner(h))

            def shake(t, p0=p0):
                place_token(p0 + Vector((0.08 * math.sin(40 * t), 0, 0.1 * math.sin(math.pi * t))))
                tip = role_map().get("BLOCH_TIP")
                if tip:
                    s = 1 + 0.8 * abs(math.sin(10 * t))
                    tip.scale = (s, s, s)
            enqueue(0.8 * D, shake)
            res = (f"RESULT: |{ev['result']}>" if ev["effective"]
                   else f"FAILED PUNT: stays at |{ev['result']}>")
            enqueue(0.01, None, lambda r=res: set_banner(r))
            enqueue(D, hop_step(p0, p1, 1.4 if ev["effective"] else 0.2,
                                v1_fn=lambda e, v0=v0, v1=v1: slerp(v0, v1, e)))
        elif kind == "touchdown":
            st = GAME.state
            name = (f"{st.team_names[ev['team']].upper()} TEAM  ({st.names[ev['player']]})"
                    if st.mode == MODE_TEAM else st.names[ev["player"]])
            txt = f"TOUCHDOWN!  {name}"
            enqueue(0.01, None, lambda t=txt: set_banner(t))
            key = GAME.state.position if GAME.state.position in ("+", "-") else "+"

            def celebrate(t, key=key):
                p = node_pos(key) + Vector((0, 0, abs(math.sin(3 * math.pi * t)) * 0.9))
                place_token(p, 0.0, spin=4 * math.pi * t)
            enqueue(1.4 * D, celebrate)
        elif kind == "kickoff":
            p0 = node_pos(ev["from"])
            p1 = node_pos(ev["to"])
            v0 = Vector(QUANTUM_STATES[ev["from"]].bloch) if ev["from"] else Vector((0, 0, 1))
            v1 = Vector(QUANTUM_STATES[ev["to"]].bloch)
            txt = f"KICKOFF  ({GAME.state.names[ev['player']]})  die = {ev['result']}"
            enqueue(0.01, None, lambda t=txt: (set_banner(t), _show_vector(True), _show_token(True)))
            enqueue(1.2 * D, hop_step(p0, p1, 2.2, v1_fn=lambda e, v0=v0, v1=v1: slerp(v0, v1, e)))
        elif kind == "no_score":
            owner = GAME.state.team_names[ev["owner"]]
            txt = (f"NO SCORE - {owner}'s endzone" if ev["entered"]
                   else "NO SCORE - must leave and re-enter")
            enqueue(0.01, None, lambda t=txt: set_banner(t))
        elif kind == "game_over":
            enqueue(0.01, None, lambda t=ev["text"]: set_banner(t.upper()))
        elif kind == "reset":
            txt = ("QUBIT TOUCHDOWN  -  TEAM BATTLE" if GAME.state.mode == MODE_TEAM
                   else "QUBIT TOUCHDOWN")
            enqueue(0.01, None, lambda t=txt: set_banner(t))
        elif kind in BANNER_EVENTS:
            txt = BANNER_EVENTS[kind](GAME.state, ev)
            enqueue(0.01, None, lambda t=txt: set_banner(t))
            enqueue(0.45 * D, None)                   # hold the banner a moment
    ensure_timer()


def _nm(s, p):
    return s.names[p]


# Event -> banner text for events that do not move the ball.
BANNER_EVENTS = {
    "dice": lambda s, ev: f"{s.team_names[ev['team']].upper()} ROLLS {ev['value']}",
    "dice_tie": lambda s, ev: f"TIE {ev['value']}-{ev['value']}  -  ROLL AGAIN",
    "dice_win": lambda s, ev: (f"{s.team_names[ev['team']].upper()} STARTS  "
                               f"({max(ev['dice'])}-{min(ev['dice'])})"),
    "borrow_request": lambda s, ev: f"BORROW:  {_nm(s, ev['from'])} ASKS {_nm(s, ev['to'])}",
    "borrow_reply": lambda s, ev: (f"{_nm(s, ev['to'])} ACCEPTS THE BORROW" if ev["accept"]
                                   else f"{_nm(s, ev['to'])} REJECTS THE BORROW"),
    "dead_borrow": lambda s, ev: f"{_nm(s, ev['player'])} DISCARDS A BORROW",
    "pass": lambda s, ev: f"{_nm(s, ev['player'])} HAS NO CARDS  -  PASS",
    "time_up": lambda s, ev: "TIME UP!",
    "challenge_start": lambda s, ev: "QUANTUM CHALLENGE!",
    "challenge_sudden": lambda s, ev: "SUDDEN DEATH QUESTION",
    "challenge_answer": lambda s, ev: (f"{s.team_names[ev['team']].upper()}: "
                                       f"{'CORRECT!' if ev['correct'] else 'WRONG'}"),
}


def _show_vector(show):
    objs = role_map()
    for r in ("BLOCH_VECTOR", "BLOCH_TIP"):
        set_hidden(objs.get(r), not show)


def _show_token(show):
    """The football only appears once it has been kicked off."""
    objs = role_map()
    for r in ("TOKEN", "TOKEN_GLOW"):
        set_hidden(objs.get(r), not show)
    set_hidden(objs.get("TOKEN_LACES"), not (show and TOKEN_SHAPE[0] == "FOOTBALL"))


# =============================================================================
# LEFTOVERS FROM OTHER / OLDER SCRIPTS
# =============================================================================

def legacy_objects(scene=None):
    """Objects named QT_* that this script did NOT create (e.g. from an older or
    different Qubit Touchdown script). They are never deleted automatically."""
    objs = scene.objects if scene is not None else bpy.data.objects
    return [o for o in objs if o.name.startswith("QT_") and not o.get("qt_generated")]


def remove_legacy_objects(scene):
    victims = legacy_objects(scene)
    names = [o.name for o in victims]
    for o in victims:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                   bpy.data.lights, bpy.data.cameras):
        for b in list(blocks):
            if b.users == 0 and b.name.startswith("QT_"):
                try:
                    blocks.remove(b)
                except Exception:
                    pass
    return names


# ---------------------------- camera views ------------------------------------

# Camera views offered in the panel: (id, label, icon). The two "goal" views
# stand behind one endzone and look across the board at the endzone that team
# must reach - the view a player would keep in the online version.
CAMERA_VIEWS = [
    ("TOP", "TOP", "AXIS_TOP"),
    ("OVERVIEW", "OVERVIEW", "CAMERA_DATA"),
    ("ATTACK_PLUS", "GOAL VIEW  → |+>", "FORWARD"),
    ("ATTACK_MINUS", "GOAL VIEW  → |->", "FORWARD"),
    ("BALL", "BALL CAM (active goal)", "PIVOT_CURSOR"),
    ("LOW", "LOW CINEMATIC", "VIEW_PERSPECTIVE"),
]


def attack_view(team):
    return "ATTACK_PLUS" if TEAM_ENDZONE[team] == "+" else "ATTACK_MINUS"


def camera_pose(view):
    # High viewing angles keep the floating sphere from hiding the far positions.
    target = Vector((0, 0, 0.4))
    if view == "TOP":
        return Vector((0, 0, 24.0)), Quaternion()          # looking down, + at top
    if view.startswith("FROM_") and view[5:] in QUANTUM_STATES:
        ang = QUANTUM_STATES[view[5:]].board_angle
        loc = Vector((math.cos(ang) * 8.0, math.sin(ang) * 8.0, 17.0))
    elif view in ("ATTACK_PLUS", "ATTACK_MINUS"):
        # Behind the opposite endzone, looking toward the goal. High enough
        # that the Bloch sphere does not hide the far endzone.
        sgn = 1.0 if view == "ATTACK_PLUS" else -1.0
        loc = Vector((0.0, -9.5 * sgn, 14.0))
        target = Vector((0.0, 1.2 * sgn, 0.5))
    elif view == "LOW":
        loc = Vector((10.0, -10.0, 6.0))
        target = Vector((0.0, 0.0, 1.2))
    elif view == "BALL":
        s = GAME.state
        p = GAME.turn_player()
        team = s.team_of[p] if p is not None else 0
        goal = QUANTUM_STATES[TEAM_ENDZONE[team]].board_xy()
        ball = QUANTUM_STATES[s.position].board_xy() if s.position else Vector((0, 0, 0))
        d = goal - ball
        if d.length < 0.5:                       # ball already at the goal
            d = goal.copy()
        d.z = 0.0
        d.normalize()
        loc = ball - d * 7.0 + Vector((0, 0, 12.5))
        target = ball + d * 2.5 + Vector((0, 0, 0.5))
    else:                                                  # OVERVIEW (from the - side)
        loc = Vector((0.0, -8.0, 17.0))
    return loc, (target - loc).to_track_quat("-Z", "Y")


def view_basis(objs=None, use_target=False):
    """Screen 'up' and 'right' projected onto the board plane (unit 2D vectors).
    Top view: up = +Y, right = +X. Used by the arrows and the minimap."""
    objs = objs or role_map()
    cam = objs.get("CAMERA")
    if cam is None:
        return Vector((0, 1, 0)), Vector((1, 0, 0))
    if use_target and _ANIM["cam"]:
        q = _ANIM["cam"]["q1"]
    elif cam.rotation_mode == "QUATERNION":
        q = cam.rotation_quaternion
    else:
        q = cam.rotation_euler.to_quaternion()
    up3, right3 = q @ Vector((0, 1, 0)), q @ Vector((1, 0, 0))
    up, right = Vector((up3.x, up3.y, 0)), Vector((right3.x, right3.y, 0))
    if right.length < 1e-6 and up.length < 1e-6:
        return Vector((0, 1, 0)), Vector((1, 0, 0))
    if up.length < 1e-6:
        up = Vector((-right.y, right.x, 0))
    if right.length < 1e-6:
        right = Vector((up.y, -up.x, 0))
    return up.normalized(), right.normalized()


def apply_camera_follow(scene=None):
    """Follow mode: TURN = goal view of the team whose turn it is, BALL = ball cam."""
    try:
        scene = scene or bpy.context.scene
        mode = scene.qt_props.camera_follow
    except Exception:
        return
    p = GAME.turn_player()
    if mode == "OFF" or p is None or not role_map():
        return
    view = attack_view(GAME.state.team_of[p]) if mode == "TURN" else "BALL"
    move_camera(view)


def move_camera(view, instant=False):
    cam = role_map().get("CAMERA")
    if cam is None:
        return False
    loc, rot = camera_pose(view)
    cam.rotation_mode = "QUATERNION"
    if instant:
        cam.location, cam.rotation_quaternion = loc, rot
        update_minimap()
        return True
    _ANIM["cam"] = {"t0": time.perf_counter(), "dur": 1.2, "l0": cam.location.copy(),
                    "l1": loc, "q0": cam.rotation_quaternion.copy(), "q1": rot}
    ensure_timer()
    return True


# =============================================================================
# DISPLAY SYNC (final, exact state after animations)
# =============================================================================

def fmt_time(sec):
    sec = max(0, int(math.ceil(sec)))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def hud_texts():
    s = GAME.state
    if s.mode == MODE_TEAM:
        score = (f"BLUE  (+ endzone):  {s.scores[0]}\n"
                 f"RED   (- endzone):  {s.scores[1]}\n")
    else:
        score = (f"{s.names[P1]}  (+ endzone):  {s.scores[0]}\n"
                 f"{s.names[P2]}  (- endzone):  {s.scores[1]}\n")
    if s.phase in ("PLAY", "BORROW"):
        score += f"Turn: {GAME.player_label(s.current)}"
    elif s.phase == "KICKOFF":
        score += f"Kickoff: {GAME.player_label(s.kicker)}"
    elif s.phase == "ROLL":
        score += "Team dice roll"
    elif s.phase == "CHALLENGE":
        a, b = s.challenge["scores"]
        score += f"QUANTUM CHALLENGE  {a}-{b}"
    elif s.phase == "GAME_OVER":
        score += "GAME OVER"
    if s.phase != "SETUP":
        if s.target:
            score += f"\nTarget: {s.target}"
        left = GAME.time_left()
        if left is not None:
            score += f"\nTime: {fmt_time(left)}" + ("  (paused)" if s.clock_paused else "")
        if s.cards == "DIGITAL":
            score += f"\nDraw pile: {len(s.deck)}"
    if s.position is None:
        state = "CURRENT STATE\n(no kickoff yet)"
    else:
        p0, p1 = probabilities(*s.amps)
        state = (f"CURRENT STATE  {QUANTUM_STATES[s.position].label}\n"
                 f"P(0) = {100 * p0:.0f}%   P(1) = {100 * p1:.0f}%")
    return score, state, s.message


def update_hud(objs=None):
    objs = objs or role_map()
    score, state, msg = hud_texts()
    for role, body in (("HUD_SCORE", score), ("HUD_STATE", state), ("HUD_MESSAGE", msg)):
        o = objs.get(role)
        if o and o.data.body != body:
            o.data.body = body


def current_mode():
    if GAME.state.phase != "SETUP":
        return GAME.state.mode
    try:
        return MODE_TEAM if bpy.context.scene.qt_props.game_mode == "TEAM" else MODE_SOLO
    except Exception:
        return MODE_SOLO


def set_emission_color(mat, rgb):
    if mat and mat.node_tree:
        node = mat.node_tree.nodes.get("QT_Emission")
        if node and tuple(node.inputs["Color"].default_value)[:3] != tuple(rgb):
            node.inputs["Color"].default_value = (*rgb, 1.0)
            mat.diffuse_color = (*rgb, 1.0)


def update_endzone_look(objs):
    """Team mode: endzones in team colours and labelled BLUE / RED."""
    team = current_mode() == MODE_TEAM
    for key, t in ENDZONE_TEAM.items():
        col = TEAM_COLORS[t] if team else COLORS[key]
        for role in (f"ENDZONE_{key}", f"MINI_EZ_{key}"):
            o = objs.get(role)
            if o and o.data.materials:
                set_emission_color(o.data.materials[0], col)
        lbl = objs.get(f"LABEL_{key}")
        if lbl:
            body = (f"{QUANTUM_STATES[key].label}  {TEAM_NAMES[t].upper()} ENDZONE" if team
                    else f"{QUANTUM_STATES[key].label}  ENDZONE")
            if lbl.data.body != body:
                lbl.data.body = body


def update_highlights(objs):
    s = GAME.state
    playable = set(GAME.playable_cards()) if s.phase == "PLAY" else set()
    for role, obj in objs.items():
        if role.startswith("EDGE_"):
            gates = set(obj["qt_gates"].split(","))
            touches = (obj["qt_from"] == s.position or
                       (not obj["qt_directed"] and obj["qt_to"] == s.position))
            live = touches and bool(gates & playable)
            set_emission_strength(obj.data.materials[0], 4.0 if live else 0.6)
        elif role.startswith("RING_"):
            key = role[5:]
            set_emission_strength(obj.data.materials[0], 6.0 if key == s.position else 0.8)


def sync_visuals():
    """Put token, Bloch vector, HUD and highlights exactly on the game state."""
    objs = role_map()
    if not objs:
        return
    s = GAME.state
    if not anim_busy():
        place_token(node_pos(s.position))
        _show_token(s.position is not None)
        tip = objs.get("BLOCH_TIP")
        if tip:
            tip.scale = (1, 1, 1)
        if s.position is None:
            _show_vector(False)
        else:
            _show_vector(True)
            set_bloch_vector(amps_to_bloch(*s.amps))
    update_hud(objs)
    update_highlights(objs)
    update_endzone_look(objs)
    update_minimap(objs)
    if not _AMB["running"]:
        update_characters(objs, 0.0, 0.0, animate=False)
    tag_redraw()


# =============================================================================
# SPACE BACKGROUND (procedural Milky Way or an HDRI image)
# =============================================================================

def _remember_world(scene):
    if "qt_prev_world" not in scene and scene.world is not None \
            and not scene.world.name.startswith("QT_"):
        scene["qt_prev_world"] = scene.world.name


def _new_world(name):
    old = bpy.data.worlds.get(name)
    if old is not None:
        bpy.data.worlds.remove(old)
    w = bpy.data.worlds.new(name)
    nt = ensure_node_tree(w)
    nt.nodes.clear()
    return w, nt


def _math(nt, op, a=None, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _map_range(nt, src, fmin, fmax, tmin, tmax):
    n = nt.nodes.new("ShaderNodeMapRange")
    n.clamp = True
    nt.links.new(src, n.inputs["Value"])
    n.inputs["From Min"].default_value = fmin
    n.inputs["From Max"].default_value = fmax
    n.inputs["To Min"].default_value = tmin
    n.inputs["To Max"].default_value = tmax
    return n.outputs["Result"]


def _vec(nt, op, a, b=None, scale=None):
    n = nt.nodes.new("ShaderNodeVectorMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, tuple):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    if scale is not None:
        if isinstance(scale, (int, float)):
            n.inputs["Scale"].default_value = scale
        else:
            nt.links.new(scale, n.inputs["Scale"])
    return n.outputs["Value"] if op == "DOT_PRODUCT" else n.outputs["Vector"]


def _direction_input(nt, props):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.name = "QT_Map"
    mp.inputs["Rotation"].default_value = (0.0, 0.0, props.bg_rotation)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def _finish_world(nt, color_socket, props):
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.name = "QT_BG"
    bg.inputs["Strength"].default_value = props.bg_strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(color_socket, bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def build_space_world(scene):
    """Procedural deep-space background: star field + a Milky Way band."""
    props = scene.qt_props
    _remember_world(scene)
    w, nt = _new_world("QT_Space_World")
    d = _direction_input(nt, props)

    # Milky Way: a band around a tilted great circle, broken up by clouds and dust lanes.
    # Band normal is nearly horizontal, so the band passes behind the board both when
    # looking down (top view) and from the side views.
    tilt = Vector((0.75, 0.62, 0.22)).normalized()
    band = _map_range(nt, _math(nt, "ABSOLUTE", _vec(nt, "DOT_PRODUCT", d, tuple(tilt))),
                      0.0, 0.30, 1.0, 0.0)
    band = _math(nt, "POWER", band, 1.4)
    clouds = nt.nodes.new("ShaderNodeTexNoise")
    clouds.inputs["Scale"].default_value = 3.0
    clouds.inputs["Detail"].default_value = 12.0
    nt.links.new(d, clouds.inputs["Vector"])
    cloud = _map_range(nt, clouds.outputs["Fac"], 0.35, 0.78, 0.05, 1.0)
    dust_n = nt.nodes.new("ShaderNodeTexNoise")
    dust_n.inputs["Scale"].default_value = 9.0
    dust_n.inputs["Detail"].default_value = 10.0
    nt.links.new(d, dust_n.inputs["Vector"])
    dust = _map_range(nt, dust_n.outputs["Fac"], 0.42, 0.62, 1.0, 0.15)
    mw = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", band, cloud), dust)
    mw = _math(nt, "MULTIPLY", mw, 0.22)
    # Warm galactic core in one direction, bluish arms elsewhere.
    core_dir = Vector((-0.3, 0.2, -0.93)).normalized()
    core_dir = (core_dir - tilt * core_dir.dot(tilt)).normalized()
    core = _map_range(nt, _vec(nt, "DOT_PRODUCT", d, tuple(core_dir)), 0.2, 1.0, 0.0, 1.0)
    warm = _vec(nt, "SCALE", (1.0, 0.62, 0.42), scale=core)
    cool = _vec(nt, "SCALE", (0.35, 0.45, 1.0), scale=_math(nt, "SUBTRACT", 1.0, core))
    mw_col = _vec(nt, "SCALE", _vec(nt, "ADD", warm, cool), scale=mw)

    # Stars: two Voronoi layers (many faint + fewer bright).
    stars_total = None
    for scale, size, power, gain in ((170.0, 0.13, 4.0, 2.0), (55.0, 0.075, 3.0, 7.0)):
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = scale
        nt.links.new(d, vor.inputs["Vector"])
        st = _map_range(nt, vor.outputs["Distance"], 0.0, size, 1.0, 0.0)
        st = _math(nt, "POWER", st, power)
        st = _math(nt, "MULTIPLY", st, _math(nt, "POWER", vor.outputs["Color"], 4.0))
        st = _math(nt, "MULTIPLY", st, gain)
        stars_total = st if stars_total is None else _math(nt, "ADD", stars_total, st)
    stars_total = _math(nt, "MULTIPLY", stars_total, _math(nt, "ADD", 1.0, _math(nt, "MULTIPLY", band, 2.0)))
    star_col = _vec(nt, "SCALE", (0.9, 0.93, 1.0), scale=stars_total)

    base = (0.002, 0.003, 0.009)
    color = _vec(nt, "ADD", _vec(nt, "ADD", star_col, mw_col), base)
    _finish_world(nt, color, props)
    scene.world = w
    return w


def build_hdri_world(scene, filepath):
    """Use an equirectangular image (e.g. a Milky Way HDRI) as the background."""
    props = scene.qt_props
    img = bpy.data.images.load(filepath, check_existing=True)
    _remember_world(scene)
    w, nt = _new_world("QT_HDRI_World")
    d = _direction_input(nt, props)
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = img
    nt.links.new(d, env.inputs["Vector"])
    _finish_world(nt, env.outputs["Color"], props)
    scene.world = w
    return w


def restore_world(scene):
    name = scene.get("qt_prev_world")
    prev = bpy.data.worlds.get(name) if name else None
    scene.world = prev
    if "qt_prev_world" in scene:
        del scene["qt_prev_world"]
    return prev


def _show_world_in_viewport(context):
    space = getattr(context, "space_data", None)
    shading = getattr(space, "shading", None)
    if shading is not None:
        shading.use_scene_world = True
        shading.use_scene_world_render = True


def _on_style(self, context):
    """Switching style rebuilds the scene; the game in progress continues."""
    if role_map():
        build_scene(self.id_data)


def _on_bloch(self, context):
    apply_bloch_transform(self.id_data)


def _on_bg_change(self, context):
    w = self.id_data.world
    if w is None or not w.name.startswith("QT_") or w.node_tree is None:
        return
    bg = w.node_tree.nodes.get("QT_BG")
    if bg:
        bg.inputs["Strength"].default_value = self.bg_strength
    mp = w.node_tree.nodes.get("QT_Map")
    if mp:
        mp.inputs["Rotation"].default_value = (0.0, 0.0, self.bg_rotation)


# =============================================================================
# AMBIENT ANIMATION LOOP (decoration only - never touches the game state)
# =============================================================================

SWIRL_LAYER_SPEED = (1.0, -0.6, 1.5)
_AMB = {"running": False, "t0": 0.0, "last": 0.0, "scene": "", "chars": {},
        "rng": random.Random(5)}


def fade_emission_material(name, rgb, strength):
    """Emission mixed with transparency so the swirl can fade in and out."""
    mat = bpy.data.materials.new(name)
    nt = ensure_node_tree(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "QT_Emission"
    em.inputs["Color"].default_value = (*rgb, 1.0)
    em.inputs["Strength"].default_value = strength
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.name = "QT_Mix"
    mix.inputs[0].default_value = 1.0
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    mat.use_backface_culling = False
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def _swirl_materials(objs):
    layer = objs.get("SWIRL_0")
    return list(layer.data.materials) if layer else []


def apply_swirl_look(scene, pulse_t=None):
    p = scene.qt_props
    objs = role_map()
    for i in range(3):
        set_hidden(objs.get(f"SWIRL_{i}"), p.swirl_opacity <= 0.001)
    for idx, mat in enumerate(_swirl_materials(objs)):
        strength = p.swirl_brightness
        if pulse_t is not None:
            strength *= 1.0 + 0.3 * math.sin(pulse_t * 1.7 + idx * 0.9)
        nodes = mat.node_tree.nodes if mat and mat.node_tree else None
        if nodes:
            em, mix = nodes.get("QT_Emission"), nodes.get("QT_Mix")
            if em:
                em.inputs["Strength"].default_value = strength
            if mix:
                mix.inputs[0].default_value = p.swirl_opacity


def update_characters(objs, t, dt, animate=True):
    """Eyes look around and blink; '> <' face and a squash when the token sits
    on a character's head. Works statically (animate=False) after each move."""
    if STYLE["name"] != "ORBIT":
        return
    tok = objs.get("TOKEN")
    tok_visible = tok is not None and not tok.hide_viewport
    rng = _AMB["rng"]
    busy = anim_busy()
    for n, key in enumerate(STATE_ORDER):
        dome, pivot = objs.get(f"NODE_{key}"), objs.get(f"EYEPIVOT_{key}")
        if dome is None or pivot is None:
            continue
        st = _AMB["chars"].setdefault(key, {"amt": 0.0, "vel": 0.0, "blink": -9.0,
                                            "next": t + rng.uniform(1.0, 4.0), "double": False})
        hurt = False
        if tok_visible:
            dxy = Vector((tok.location.x - dome.location.x, tok.location.y - dome.location.y))
            hurt = dxy.length < 0.45 and tok.location.z < STYLE["token_h"] + 0.15
        target = 1.0 if hurt else 0.0
        if animate and dt > 0:
            acc = 170.0 * (target - st["amt"]) - 9.0 * st["vel"]     # bouncy spring
            st["vel"] += acc * dt
            st["amt"] += st["vel"] * dt
        else:
            st["amt"], st["vel"] = target, 0.0
        a = st["amt"]
        dome.scale = (1 + 0.10 * a, 1 + 0.10 * a, max(0.5, 1 - 0.16 * a))

        blink, lx, ly = 1.0, 0.0, 0.0
        if animate:
            if t >= st["next"]:
                st["blink"], st["double"] = t, rng.random() < 0.25
                st["next"] = t + rng.uniform(2.0, 5.0)
            bt = t - st["blink"]
            for start in ((0.0, 0.26) if st["double"] else (0.0,)):
                if 0.0 <= bt - start < 0.16:
                    blink = max(0.08, abs(bt - start - 0.08) / 0.08)
            lx = 0.05 * math.sin(t * 0.6 + n * 1.7) + 0.025 * math.sin(t * 1.7 + n)
            ly = 0.035 * math.sin(t * 0.9 + n * 2.3)
            if busy and tok_visible and not hurt:        # everyone watches the flying token
                local = pivot.matrix_world.inverted() @ tok.matrix_world.translation
                v2 = Vector((local.x, local.y))
                if v2.length > 1e-3:
                    v2 = v2.normalized()
                    lx, ly = 0.065 * v2.x, 0.045 * v2.y
        for side in (-1, 1):
            eye, hurt_eye = objs.get(f"EYE_{key}_{side}"), objs.get(f"EYEHURT_{key}_{side}")
            set_hidden(eye, hurt)
            set_hidden(hurt_eye, not hurt)
            if eye is not None and not hurt:
                eye.location = (0.17 * side + lx, 0.04 + ly, 0.74)
                eye.scale = (0.055, 0.13 * blink, 0.03)
            if hurt_eye is not None and hurt:
                jit = 0.01 * math.sin(t * 45.0 + side) if animate else 0.0
                hurt_eye.location = (0.17 * side + jit, 0.04, 0.74)


def animate_token_idle(objs, t):
    tok = objs.get("TOKEN")
    if tok is None or tok.hide_viewport:
        return
    base = Vector(TOKEN_BASE_SCALE[TOKEN_SHAPE[0]])
    if anim_busy():
        tok.scale = base
        return
    shape = TOKEN_SHAPE[0]
    if shape == "HEART":                                  # lub-dub heartbeat
        ph = (t * 1.2) % 1.0
        beat = math.exp(-((ph - 0.10) / 0.05) ** 2) + 0.6 * math.exp(-((ph - 0.28) / 0.05) ** 2)
        tok.scale = base * (1.0 + 0.12 * beat)
    elif shape == "STAR":                                 # sway and twinkle
        tok.rotation_euler = (0.0, 0.0, face_camera_angle(tok.location) + 0.45 * math.sin(t * 1.3))
        tok.scale = base * (1.0 + 0.05 * math.sin(t * 6.0))
    else:                                                 # football rocks gently
        e = tok.rotation_euler
        tok.rotation_euler = (0.08 * math.sin(t * 2.2), e.y, e.z)


def _ambient_tick():
    if not _AMB["running"]:
        return None
    try:
        scene = bpy.data.scenes.get(_AMB["scene"]) or bpy.context.scene
        p = scene.qt_props
        now = time.perf_counter()
        dt = min(0.1, max(0.0, now - _AMB["last"]))
        _AMB["last"] = now
        t = now - _AMB["t0"]
        objs = role_map()
        if objs:
            if p.amb_swirl:
                for i in range(3):
                    layer = objs.get(f"SWIRL_{i}")
                    if layer is not None:
                        layer.rotation_euler.z += p.swirl_speed * SWIRL_LAYER_SPEED[i] * dt
                apply_swirl_look(scene, pulse_t=t)
            update_characters(objs, t, dt, animate=p.amb_eyes)
            animate_token_idle(objs, t)
            tag_redraw()
    except Exception:
        traceback.print_exc()
    return 1.0 / 30.0


def start_ambient(scene):
    stop_ambient(reset=False)
    _AMB.update(running=True, t0=time.perf_counter(), last=time.perf_counter(), scene=scene.name)
    bpy.app.timers.register(_ambient_tick, first_interval=0.0)
    bpy.app.driver_namespace["qt_ambient_tick"] = _ambient_tick


def stop_ambient(reset=True):
    _AMB["running"] = False
    for fn in (bpy.app.driver_namespace.get("qt_ambient_tick"), _ambient_tick):
        try:
            if fn is not None and bpy.app.timers.is_registered(fn):
                bpy.app.timers.unregister(fn)
        except Exception:
            pass
    if reset:
        objs = role_map()
        tok = objs.get("TOKEN")
        if tok is not None:
            tok.scale = TOKEN_BASE_SCALE[TOKEN_SHAPE[0]]
        update_characters(objs, 0.0, 0.0, animate=False)
        try:
            apply_swirl_look(bpy.context.scene)
        except Exception:
            pass
        sync_visuals()


def _on_token_shape(self, context):
    apply_token_shape(self.token_shape)


def _on_swirl_look(self, context):
    apply_swirl_look(self.id_data)


# =============================================================================
# SETTINGS / PROPERTIES
# =============================================================================

def deck_counts_from_props(props):
    return {c: getattr(props, f"deck_{c.lower()}") for c in CARD_ORDER}


class QT_Properties(PropertyGroup):
    game_mode: EnumProperty(
        name="Game Mode",
        items=[("SOLO", "Solo (1 v 1)", "Two players, the original game"),
               ("TEAM", "Team (2 v 2)", "Blue (P1, P2) vs Red (P3, P4), one shared football")],
        default="SOLO")
    mode: EnumProperty(
        name="Cards",
        items=[("DIGITAL", "Digital Deck", "Shuffle a 52-card deck, 4-card hands, draw after each play"),
               ("PHYSICAL", "Physical Cards", "Use your real cards: any card button can be played")],
        default="DIGITAL")
    first_kicker: EnumProperty(name="First kickoff",
                               items=[("P1", "Player 1", ""), ("P2", "Player 2", "")], default="P1")
    p1_name: StringProperty(name="Player 1 (+)", default="Player 1")
    p2_name: StringProperty(name="Player 2 (-)", default="Player 2")
    t1_name: StringProperty(name="P1 (Blue)", default="P1")
    t2_name: StringProperty(name="P2 (Blue)", default="P2")
    t3_name: StringProperty(name="P3 (Red)", default="P3")
    t4_name: StringProperty(name="P4 (Red)", default="P4")
    anim_speed: FloatProperty(name="Animation speed", min=0.25, max=4.0, default=1.2)
    history_rows: IntProperty(name="History rows", min=5, max=200, default=14)
    deck_h: IntProperty(name="H", min=0, max=52, default=DEFAULT_DECK["H"])
    deck_x: IntProperty(name="X", min=0, max=52, default=DEFAULT_DECK["X"])
    deck_y: IntProperty(name="Y", min=0, max=52, default=DEFAULT_DECK["Y"])
    deck_z: IntProperty(name="Z", min=0, max=52, default=DEFAULT_DECK["Z"])
    deck_s: IntProperty(name="S", min=0, max=52, default=DEFAULT_DECK["S"])
    deck_sx: IntProperty(name="√X", min=0, max=52, default=DEFAULT_DECK["SX"])
    deck_i: IntProperty(name="I", min=0, max=52, default=DEFAULT_DECK["I"])
    deck_m: IntProperty(name="Measure", min=0, max=52, default=DEFAULT_DECK["M"])
    deck_b: IntProperty(name="Borrow (team)", min=0, max=52, default=DEFAULT_DECK["B"])
    solo_target: IntProperty(name="Target score", min=0, max=99, default=0,
                             description="Solo: first to this score wins (0 = off)")
    solo_time: IntProperty(name="Time (min)", min=0, max=240, default=0,
                           description="Solo: match time in minutes (0 = no timer)")
    team_target: IntProperty(name="Target score", min=0, max=99, default=7,
                             description="Team: first team to this score wins (0 = off)")
    team_time: IntProperty(name="Time (min)", min=0, max=240, default=15,
                           description="Team: match time in minutes (0 = no timer)")
    tie_break: BoolProperty(name="Quantum Challenge on a tie", default=True,
                            description="A tied game goes to a 5-question Quantum Challenge")
    sudden_death: BoolProperty(name="Sudden death if still tied", default=True)
    camera_follow: EnumProperty(
        name="Follow",
        items=[("OFF", "Off", "The camera only moves when you press a view button"),
               ("TURN", "Turn", "Goal view of the player whose turn it is"),
               ("BALL", "Ball", "Ball cam toward the active player's goal after every move")],
        default="OFF")
    chat_input: StringProperty(name="Message", default="")
    debug_mode: BoolProperty(name="Debug panel (counts only)", default=False)
    token_shape: EnumProperty(
        name="Token",
        items=[("FOOTBALL", "Football", "Original football"),
               ("HEART", "Heart", "Heart-shaped token"),
               ("STAR", "Star", "Star-shaped token")],
        default="FOOTBALL", update=_on_token_shape)
    swirl_speed: FloatProperty(name="Flow Speed", min=0.0, max=3.0, default=0.5)
    swirl_brightness: FloatProperty(name="Brightness", min=0.0, max=5.0, default=1.0,
                                    update=_on_swirl_look)
    swirl_opacity: FloatProperty(name="Opacity", min=0.0, max=1.0, default=0.85,
                                 subtype="FACTOR", update=_on_swirl_look)
    amb_swirl: BoolProperty(name="Swirl flows", default=True)
    amb_eyes: BoolProperty(name="Eyes look around & blink", default=True)
    style: EnumProperty(
        name="Board Style",
        items=[("ORBIT", "Orbit", "Floating dome characters, orbit lines, Milky Way sky"),
               ("CLASSIC", "Classic", "Flat glowing board")],
        default="ORBIT", update=_on_style)
    bloch_x: FloatProperty(name="X", default=0.0, update=_on_bloch, step=10)
    bloch_y: FloatProperty(name="Y", default=0.0, update=_on_bloch, step=10)
    bloch_z: FloatProperty(name="Height", default=BLOCH_CENTER.z, min=-20, max=30,
                           update=_on_bloch, step=10)
    bloch_size: FloatProperty(name="Size", default=1.0, min=0.2, max=4.0, update=_on_bloch)
    bg_strength: FloatProperty(name="Brightness", min=0.0, max=10.0, default=1.0,
                               update=_on_bg_change)
    bg_rotation: FloatProperty(name="Rotation", subtype="ANGLE", default=0.0,
                               update=_on_bg_change)


# =============================================================================
# MATCH CLOCK (only runs when a time limit is set)
# =============================================================================

_CLOCK = {"last": 0.0, "shown": ""}


def _clock_tick():
    try:
        s = GAME.state
        if s.time_limit <= 0 or s.phase in ("SETUP", "GAME_OVER", "CHALLENGE"):
            return None
        now = time.perf_counter()
        dt = min(1.0, now - _CLOCK["last"])
        _CLOCK["last"] = now
        expired = GAME.tick(dt)
        if expired and not anim_busy():
            events, _err = GAME.time_up()
            if events:
                animate_events(events)
                sync_visuals()
                return None if GAME.state.phase in ("GAME_OVER",) else 0.5
        shown = fmt_time(GAME.time_left() or 0)
        if shown != _CLOCK["shown"]:
            _CLOCK["shown"] = shown
            update_hud()
            tag_redraw()
        return 0.25
    except Exception:
        traceback.print_exc()
        return None


def start_clock():
    stop_clock()
    if GAME.state.time_limit <= 0:
        return
    _CLOCK["last"] = time.perf_counter()
    _CLOCK["shown"] = ""
    bpy.app.timers.register(_clock_tick, first_interval=0.25)
    bpy.app.driver_namespace["qt_clock_tick"] = _clock_tick


def stop_clock():
    for fn in (bpy.app.driver_namespace.get("qt_clock_tick"), _clock_tick):
        try:
            if fn is not None and bpy.app.timers.is_registered(fn):
                bpy.app.timers.unregister(fn)
        except Exception:
            pass


# =============================================================================
# GAME LOGIC OPERATORS
# =============================================================================

def _scene_ready(op):
    if not role_map():
        op.report({"WARNING"}, "Press 'Build / Rebuild Scene' first")
        return False
    if anim_busy():
        op.report({"INFO"}, "Wait for the animation to finish")
        return False
    return True


def _run_events(op, events, err, follow=True):
    if err:
        GAME.state.message = err
        op.report({"WARNING"}, err)
        sync_visuals()
        return {"CANCELLED"}
    animate_events(events)
    if follow:
        enqueue(0.01, None, lambda: apply_camera_follow())
    sync_visuals()
    return {"FINISHED"}


class QT_OT_build_scene(Operator):
    bl_idname = "qt.build_scene"
    bl_label = "Build / Rebuild Scene"
    bl_description = "(Re)create the board. Only objects made by this script are removed"

    def execute(self, context):
        try:
            build_scene(context.scene)
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, f"Build failed: {exc}")
            return {"CANCELLED"}
        return {"FINISHED"}


class QT_OT_start_game(Operator):
    bl_idname = "qt.start_game"
    bl_label = "Start Game"
    bl_description = "Shuffle, deal 4 cards each and go to the kickoff (team mode: dice roll first)"

    def execute(self, context):
        try:
            if not role_map():
                build_scene(context.scene)
            stop_animations()
            stop_clock()
            p = context.scene.qt_props
            team = p.game_mode == "TEAM"
            counts = deck_counts_from_props(p)
            if not team:
                counts["B"] = 0
            total = sum(counts.values())
            n_players = 4 if team else 2
            cards = "DIGITAL" if team else p.mode
            if cards == "DIGITAL" and total < n_players * HAND_SIZE:
                self.report({"WARNING"}, f"Deck is too small ({total} cards for {n_players} players)")
                return {"CANCELLED"}
            names = ((p.t1_name or "P1", p.t2_name or "P2", p.t3_name or "P3", p.t4_name or "P4")
                     if team else (p.p1_name or "Player 1", p.p2_name or "Player 2"))
            GAME.new_game(MODE_TEAM if team else MODE_SOLO, cards, counts, names,
                          P1 if p.first_kicker == "P1" else P2,
                          p.team_target if team else p.solo_target,
                          60.0 * (p.team_time if team else p.solo_time),
                          p.tie_break, p.sudden_death)
            gates = total - counts.get("B", 0)
            if cards == "DIGITAL" and (gates != DECK_SIZE or (team and counts["B"] != 3)):
                rule = "52 + 3 Borrow" if team else "52"
                GAME.state.message += f"  (Note: deck has {total} cards, rules say {rule})"
            animate_events([{"type": "reset"}])
            sync_visuals()
            start_clock()
            if not team:
                apply_camera_follow(context.scene)
        except Exception as exc:
            traceback.print_exc()
            self.report({"ERROR"}, f"Could not start the game: {exc}")
            return {"CANCELLED"}
        return {"FINISHED"}


class QT_OT_roll_team(Operator):
    bl_idname = "qt.roll_team"
    bl_label = "Roll Team Die"
    bl_description = "Roll this team's die (1-6). The higher roll kicks off; a tie rolls again"
    team: IntProperty(default=0)      # 0 = Blue, 1 = Red, -1 = both remaining

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        teams = [t for t in (0, 1) if GAME.state.dice[t] is None] if self.team < 0 else [self.team]
        events = []
        for t in teams:
            ev, err = GAME.roll_team(t)
            if err:
                return _run_events(self, None, err)
            events += ev
            if GAME.state.phase != "ROLL" or GAME.state.dice == [None, None]:
                break                        # decided, or tie -> roll again
        return _run_events(self, events, None)


class QT_OT_kickoff(Operator):
    bl_idname = "qt.kickoff"
    bl_label = "Kickoff"
    bl_description = "Kick off: roll the binary die, or enter the result of a real die"
    result: IntProperty(default=-1)       # -1 = roll the digital die

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.kickoff(None if self.result < 0 else self.result)
        return _run_events(self, events, err)


class QT_OT_play_card(Operator):
    bl_idname = "qt.play_card"
    bl_label = "Play Card"
    bl_description = "Play this card from the current player's hand"
    card: StringProperty(default="I")

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.play_card(self.card)
        return _run_events(self, events, err)


class QT_OT_borrow_request(Operator):
    bl_idname = "qt.borrow_request"
    bl_label = "Request with Borrow"
    bl_description = "Play a Borrow card and ask your teammate for this card"
    kind: StringProperty(default="H")

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.request_borrow(self.kind)
        return _run_events(self, events, err, follow=False)


class QT_OT_borrow_reply(Operator):
    bl_idname = "qt.borrow_reply"
    bl_label = "Answer Borrow"
    bl_description = "Teammate answers the Borrow request"
    accept: BoolProperty(default=True)

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.respond_borrow(self.accept)
        return _run_events(self, events, err)


class QT_OT_discard_borrow(Operator):
    bl_idname = "qt.discard_borrow"
    bl_label = "Discard a Borrow (nothing to request)"
    bl_description = ("Prototype rule: when you hold only Borrow cards and your teammate has "
                      "nothing to lend, discard one Borrow as your turn (ball stays)")

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.discard_borrow()
        return _run_events(self, events, err)


class QT_OT_arrow(Operator):
    bl_idname = "qt.arrow"
    bl_label = "Move"
    bl_description = "Play the card from your hand whose board line points this way on screen"
    direction: StringProperty(default="UP")

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        up, right = view_basis(use_target=True)
        opt = GAME.arrow_options(up, right).get(self.direction)
        if not opt:
            self.report({"INFO"}, "No card in hand moves the ball that way")
            return {"CANCELLED"}
        events, err = GAME.play_card(opt[1])
        return _run_events(self, events, err)


class QT_OT_challenge_answer(Operator):
    bl_idname = "qt.challenge_answer"
    bl_label = "Answer"
    bl_description = "This team answers the current Quantum Challenge question"
    team: IntProperty(default=0)
    option: IntProperty(default=0)

    def execute(self, context):
        events, err = GAME.answer_challenge(self.team, self.option)
        return _run_events(self, events, err, follow=False)


class QT_OT_challenge_skip(Operator):
    bl_idname = "qt.challenge_skip"
    bl_label = "Skip Question (no point)"

    def execute(self, context):
        events, err = GAME.skip_question()
        return _run_events(self, events, err, follow=False)


class QT_OT_chat_send(Operator):
    bl_idname = "qt.chat_send"
    bl_label = "Send"
    bl_description = "Send a message to your own team only"

    def execute(self, context):
        p = context.scene.qt_props
        _ev, err = GAME.send_chat(p.chat_input)
        if err:
            self.report({"WARNING"}, err)
            return {"CANCELLED"}
        p.chat_input = ""
        tag_redraw()
        return {"FINISHED"}


class QT_OT_clock_toggle(Operator):
    bl_idname = "qt.clock_toggle"
    bl_label = "Pause / Resume Clock"

    def execute(self, context):
        GAME.state.clock_paused = not GAME.state.clock_paused
        update_hud()
        tag_redraw()
        return {"FINISHED"}


class QT_OT_finish(Operator):
    bl_idname = "qt.finish_game"
    bl_label = "Finish Game (physical cards)"
    bl_description = "End a physical-cards game when all 52 cards have been played"

    def execute(self, context):
        if not _scene_ready(self):
            return {"CANCELLED"}
        events, err = GAME.finish_physical()
        return _run_events(self, events, err, follow=False)


class QT_OT_reset_game(Operator):
    bl_idname = "qt.reset_game"
    bl_label = "RESET GAME"
    bl_description = "Clear scores, history, deck and token; choose the mode and kickoff again"

    def execute(self, context):
        stop_animations()
        stop_clock()
        global GAME
        GAME = QuantumGame()
        set_banner("QUBIT TOUCHDOWN")
        sync_visuals()
        return {"FINISHED"}


class QT_OT_camera(Operator):
    bl_idname = "qt.camera_view"
    bl_label = "Camera View"
    bl_description = "Move the game camera (does not change the game)"
    view: StringProperty(default="TOP")

    def execute(self, context):
        if not move_camera(self.view):
            self.report({"WARNING"}, "Build the scene first")
            return {"CANCELLED"}
        cam = role_map().get("CAMERA")
        context.scene.camera = cam
        space = context.space_data
        if space and getattr(space, "region_3d", None):
            space.region_3d.view_perspective = "CAMERA"
        return {"FINISHED"}


class QT_OT_cleanup_legacy(Operator):
    bl_idname = "qt.cleanup_legacy"
    bl_label = "Delete Old QT_ Objects"
    bl_description = ("Delete QT_* objects left by an older or different Qubit Touchdown "
                      "script (objects made by this script are not affected)")
    bl_options = {"REGISTER", "UNDO"}

    def invoke(self, context, event):
        n = len(legacy_objects(context.scene))
        if n == 0:
            self.report({"INFO"}, "No old QT_ objects found")
            return {"CANCELLED"}
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        names = remove_legacy_objects(context.scene)
        print("Removed old objects:", names)
        self.report({"INFO"}, f"Removed {len(names)} old QT_ objects")
        sync_visuals()
        return {"FINISHED"}


class QT_OT_space_background(Operator):
    bl_idname = "qt.space_background"
    bl_label = "Space / Milky Way (built-in)"
    bl_description = "Procedural star field with a Milky Way band - no download needed"

    def execute(self, context):
        build_space_world(context.scene)
        _show_world_in_viewport(context)
        return {"FINISHED"}


class QT_OT_hdri_background(Operator, ImportHelper):
    bl_idname = "qt.hdri_background"
    bl_label = "Load Milky Way Image (HDRI)..."
    bl_description = "Use a panoramic (equirectangular) .hdr/.exr/.jpg image as the background"
    filter_glob: StringProperty(default="*.hdr;*.exr;*.jpg;*.jpeg;*.png", options={"HIDDEN"})

    def execute(self, context):
        try:
            build_hdri_world(context.scene, self.filepath)
        except Exception as exc:
            self.report({"ERROR"}, f"Could not load image: {exc}")
            return {"CANCELLED"}
        _show_world_in_viewport(context)
        return {"FINISHED"}


class QT_OT_restore_background(Operator):
    bl_idname = "qt.restore_background"
    bl_label = "Restore Original Background"

    def execute(self, context):
        restore_world(context.scene)
        return {"FINISHED"}


class QT_OT_ambient_toggle(Operator):
    bl_idname = "qt.ambient_toggle"
    bl_label = "Start / Stop Animation"
    bl_description = "Loop the decorative animation (swirl flow, eyes, token idle)"

    def execute(self, context):
        if _AMB["running"]:
            stop_ambient()
        else:
            if not role_map():
                self.report({"WARNING"}, "Build the scene first")
                return {"CANCELLED"}
            start_ambient(context.scene)
        return {"FINISHED"}


class QT_OT_reset_bloch(Operator):
    bl_idname = "qt.reset_bloch"
    bl_label = "Reset Sphere Position"

    def execute(self, context):
        p = context.scene.qt_props
        p["bloch_x"], p["bloch_y"], p["bloch_z"], p["bloch_size"] = 0.0, 0.0, BLOCH_CENTER.z, 1.0
        apply_bloch_transform(context.scene)
        return {"FINISHED"}


class QT_OT_select_bloch(Operator):
    bl_idname = "qt.select_bloch"
    bl_label = "Select Sphere (move with G)"
    bl_description = "Select the Bloch sphere so you can drag it with G / the Move tool"

    def execute(self, context):
        root = role_map().get("BLOCH_ROOT")
        if root is None:
            return {"CANCELLED"}
        for o in context.view_layer.objects:
            o.select_set(False)
        root.select_set(True)
        context.view_layer.objects.active = root
        return {"FINISHED"}


class QT_OT_self_test(Operator):
    bl_idname = "qt.self_test"
    bl_label = "Run Self-Test"

    def execute(self, context):
        ok, lines = run_self_test()
        print("\n=== Qubit Touchdown self-test ===")
        for l in lines:
            print(l)
        n_fail = sum(1 for l in lines if l.startswith("FAIL"))
        msg = f"Self-test: {len(lines) - n_fail}/{len(lines)} passed"
        GAME.state.message = msg
        self.report({"INFO"} if ok else {"WARNING"}, msg)
        sync_visuals()
        return {"FINISHED"}


# =============================================================================
# BLENDER UI
# =============================================================================

def wrapped(layout, context, text, icon="NONE"):
    width = 34
    if context.region is not None:
        width = max(18, int((context.region.width - 50) / 8.5))
    col = layout.column(align=True)
    col.scale_y = 0.8
    for i, line in enumerate(textwrap.wrap(text, width) or [""]):
        col.label(text=line, icon=icon if i == 0 else "NONE")


def ui_mode(context):
    s = GAME.state
    if s.phase != "SETUP":
        return s.mode
    return MODE_TEAM if context.scene.qt_props.game_mode == "TEAM" else MODE_SOLO


class QT_PT_base:
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Qubit Touchdown"


class QT_PT_main(QT_PT_base, Panel):
    bl_idname = "QT_PT_main"
    bl_label = "Qubit Touchdown"

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        s = GAME.state
        layout.row().prop(p, "style", expand=True)
        layout.operator("qt.build_scene", icon="FILE_REFRESH")
        old = legacy_objects(context.scene)
        if old:
            warn = layout.box()
            warn.alert = True
            wrapped(warn, context, f"{len(old)} QT_ objects from another/older script are in "
                                   "this scene (e.g. a second board or football).", icon="ERROR")
            warn.operator("qt.cleanup_legacy", icon="TRASH")
        if not role_map():
            layout.label(text="Build the scene to begin.", icon="INFO")

        layout.row().prop(p, "game_mode", expand=True)
        if s.phase not in ("SETUP", "GAME_OVER") and (p.game_mode == "TEAM") != (s.mode == MODE_TEAM):
            layout.label(text="Mode change applies at the next Start Game", icon="INFO")

        box = layout.box()
        row = box.row()
        if s.mode == MODE_TEAM:
            row.label(text=f"Blue (+): {s.scores[0]}", icon="COLORSET_04_VEC")
            row.label(text=f"Red (-): {s.scores[1]}", icon="COLORSET_01_VEC")
        else:
            row.label(text=f"{s.names[P1]} (+): {s.scores[0]}")
            row.label(text=f"{s.names[P2]} (-): {s.scores[1]}")
        if s.phase in ("PLAY", "BORROW"):
            box.label(text=f"Turn: {GAME.player_label(s.current)}", icon="PLAY")
        elif s.phase == "KICKOFF":
            box.label(text=f"Kickoff: {GAME.player_label(s.kicker)}", icon="EVENT_K")
        elif s.phase == "ROLL":
            box.label(text="Team dice roll", icon="EVENT_K")
        elif s.phase == "CHALLENGE":
            box.label(text="Quantum Challenge (tie-break)", icon="QUESTION")
        elif s.phase == "GAME_OVER":
            box.label(text="Game over", icon="CHECKMARK")
        if s.phase != "SETUP":
            row = box.row()
            row.label(text=f"Target: {s.target}" if s.target else "Target: off")
            left = GAME.time_left()
            row.label(text=f"Time: {fmt_time(left)}" if left is not None else "Time: off")
            if left is not None and s.phase in ACTIVE_PHASES:
                box.operator("qt.clock_toggle", text="Resume Clock" if s.clock_paused else "Pause Clock",
                             icon="PLAY" if s.clock_paused else "PAUSE")
        if s.cards == "DIGITAL" and s.phase != "SETUP":
            box.label(text=f"Draw pile: {len(s.deck)} cards")
        if s.message:
            wrapped(box, context, s.message, icon="INFO")
        if anim_busy():
            box.label(text="Animating...", icon="TIME")

        col = layout.column(align=True)
        if s.phase in ("SETUP", "GAME_OVER"):
            col.label(text="NEW GAME")
            if p.game_mode == "SOLO":
                col.prop(p, "mode", text="")
                col.prop(p, "first_kicker")
                tgt, tm = p.solo_target, p.solo_time
            else:
                wrapped(col, context, "Blue: P1 + P2 (score at +).  Red: P3 + P4 (score at -). "
                                      "Order P1 → P3 → P2 → P4.")
                tgt, tm = p.team_target, p.team_time
            col.label(text=(f"Target {tgt if tgt else 'off'}  ·  "
                            f"Time {str(tm) + ' min' if tm else 'off'}  (Rules & Settings)"))
            big = col.row()
            big.scale_y = 1.3
            big.operator("qt.start_game", icon="PLAY")
        elif s.phase == "ROLL":
            col.label(text="TEAM DICE  (higher roll kicks off)")
            row = col.row(align=True)
            row.scale_y = 1.3
            for t in (0, 1):
                cell = row.row(align=True)
                d = s.dice[t]
                cell.enabled = d is None
                op = cell.operator("qt.roll_team", icon="SHADERFX",
                                   text=(f"{TEAM_NAMES[t]}: {d}" if d else f"Roll {TEAM_NAMES[t]}"))
                op.team = t
            op = col.operator("qt.roll_team", text="Roll Both")
            op.team = -1
        elif s.phase == "KICKOFF":
            col.label(text="STARTING POSITION (KICKOFF)")
            wrapped(col, context, f"{GAME.player_label(s.kicker)} kicks off with the binary die "
                                  "(0 or 1, 50:50).")
            big = col.row()
            big.scale_y = 1.3
            op = big.operator("qt.kickoff", text="Roll Binary Die", icon="SHADERFX")
            op.result = -1
            row = col.row(align=True)
            op = row.operator("qt.kickoff", text="0")
            op.result = 0
            op = row.operator("qt.kickoff", text="1")
            op.result = 1
            col.label(text="(0 / 1 = result of a real die)")
        elif s.phase == "CHALLENGE":
            col.label(text="Answer in 'Quantum Challenge' below.", icon="QUESTION")
        else:
            col.label(text="Kickoff done - ball in play.")


class QT_PT_result(QT_PT_base, Panel):
    bl_idname = "QT_PT_result"
    bl_label = "Match Result"

    @classmethod
    def poll(cls, context):
        return GAME.state.phase == "GAME_OVER"

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        box = layout.box()
        if s.winner is None or s.winner < 0:
            box.label(text="DRAW", icon="CHECKMARK")
        else:
            box.label(text=f"WINNER: {s.team_names[s.winner]}", icon="CHECKMARK")
        names = (TEAM_NAMES if s.mode == MODE_TEAM else s.names[:2])
        box.label(text=f"Final score  {names[0]} {s.scores[0]}  -  {s.scores[1]} {names[1]}")
        if s.end_reason:
            box.label(text=f"Ended: {s.end_reason}")
        if s.challenge:
            a, b = s.challenge["scores"]
            cb = layout.box()
            cb.label(text=f"Quantum Challenge  {names[0]} {a} - {b} {names[1]}", icon="QUESTION")
            col = cb.column(align=True)
            col.scale_y = 0.8
            for line in s.challenge["log"]:
                col.label(text=line)
        row = layout.row()
        row.scale_y = 1.3
        row.operator("qt.start_game", text="Play Again", icon="LOOP_FORWARDS")


class QT_PT_challenge(QT_PT_base, Panel):
    bl_idname = "QT_PT_challenge"
    bl_label = "Quantum Challenge"

    @classmethod
    def poll(cls, context):
        return GAME.state.phase == "CHALLENGE"

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        ch = s.challenge
        q = ch["current"]
        names = (TEAM_NAMES if s.mode == MODE_TEAM else s.names[:2])
        a, b = ch["scores"]
        layout.label(text=f"Challenge score  {names[0]} {a} - {b} {names[1]}")
        head = (f"Sudden death  (Q{q['number']})" if ch["sudden"]
                else f"Question {q['number']} of {ch['base']}")
        box = layout.box()
        box.label(text=head, icon="QUESTION")
        wrapped(box, context, q["text"])
        letters = "ABCD"
        for i, opt in enumerate(q["options"]):
            wrapped(box, context, f"{letters[i]})  {opt}")
        wrapped(layout, context, "Teams may discuss. The first team with the right answer "
                                 "scores; a wrong answer locks that team out of this question.")
        for t in (0, 1):
            row = layout.row(align=True)
            row.label(text=f"{names[t]}:")
            for i in range(len(q["options"])):
                cell = row.row(align=True)
                cell.enabled = not ch["locked"][t]
                op = cell.operator("qt.challenge_answer", text=letters[i])
                op.team, op.option = t, i
            if ch["locked"][t]:
                row.label(text="locked", icon="CANCEL")
        layout.operator("qt.challenge_skip", icon="FORWARD")


class QT_PT_gates(QT_PT_base, Panel):
    bl_idname = "QT_PT_gates"
    bl_label = "Your Hand (Cards)"

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        team = s.mode == MODE_TEAM
        in_play = s.phase in ("PLAY", "BORROW")
        if not in_play:
            layout.label(text="Available after the kickoff.")
        else:
            who = GAME.player_label(s.current)
            if s.cards == "DIGITAL":
                n_hand = len(s.hands[s.current])
                layout.label(text=f"{who}'s hand: {n_hand} card{'s' if n_hand != 1 else ''}",
                             icon="USER")
            else:
                layout.label(text=f"{who}: play a card", icon="USER")
        if s.phase == "BORROW" and s.pending:
            wb = layout.box()
            wb.label(text=f"Waiting for {s.names[s.pending['to']]} to answer the Borrow", icon="TIME")
        grid = layout.grid_flow(row_major=True, columns=2, even_columns=True, align=True)
        for card in PLAY_KINDS:                     # 7 gates + Measurement = 8 cards
            cell = grid.row(align=True)
            n = GAME.card_count(card) if (s.cards == "DIGITAL" and in_play) else None
            txt = "Measure" if card == "M" else CARD_LABEL[card]
            if n is not None:
                txt += f" ×{n}"
            if s.phase == "PLAY" and s.position is not None:
                if card == "M":
                    txt += (f" → {QUANTUM_STATES[s.position].label}"
                            if s.position in ("0", "1") else " → |0>/|1>")
                else:
                    dest = GAME.preview(card)
                    if dest:
                        txt += f" → {QUANTUM_STATES[dest].label}"
            cell.enabled = s.phase == "PLAY" and (n is None or n > 0)
            op = cell.operator("qt.play_card", text=txt,
                               icon="VIEWZOOM" if card == "M" else "NONE")
            op.card = card
        if team and in_play:
            nb = GAME.card_count("B")
            row = layout.row()
            row.label(text=f"Borrow ×{nb}", icon="LINKED")
            if nb and s.phase == "PLAY":
                row.label(text="→ pick a card in 'Teammate & Borrow'")
            if GAME.can_discard_borrow():
                layout.operator("qt.discard_borrow", icon="TRASH")
        if s.phase == "PLAY" and s.position is not None:
            hint = ("Measure at |0>/|1> = failed punt: the ball stays."
                    if s.position in ("0", "1") else
                    "Measure here: 50% |0>, 50% |1>.")
            wrapped(layout, context, hint, icon="INFO")
        if s.phase == "PLAY":
            draw_line = (f"After playing you refill to {HAND_SIZE} cards (draw pile: {len(s.deck)})."
                         if s.cards == "DIGITAL" and s.deck else
                         "Draw pile empty: play the cards left in your hand."
                         if s.cards == "DIGITAL" else "")
            wrapped(layout, context, "If a gate has no line at the ball's position, the "
                                     "ball stays put (the card is still used). You cannot pass. "
                                     + draw_line)


class QT_PT_team(QT_PT_base, Panel):
    bl_idname = "QT_PT_team"
    bl_label = "Teammate & Borrow"

    @classmethod
    def poll(cls, context):
        return ui_mode(context) == MODE_TEAM

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        if s.mode != MODE_TEAM or s.phase == "SETUP":
            layout.label(text="Start a team game to see hands.")
            return
        p = GAME.turn_player()
        if p is None:
            wrapped(layout, context, "Hands are shown to the team whose turn it is.")
            draw_opponents(layout, None)
            return
        team = s.team_of[p]
        layout.label(text=f"Viewing as {TEAM_NAMES[team]} team (demo, one computer)",
                     icon="COMMUNITY")
        if s.phase == "BORROW" and s.pending:
            pb = layout.box()
            pb.alert = True
            fr, to = s.pending["from"], s.pending["to"]
            pb.label(text=f"{s.names[fr]} asks {s.names[to]} for: "
                          f"{CARD_LABEL[s.pending['kind']]}", icon="LINKED")
            row = pb.row(align=True)
            row.scale_y = 1.3
            op = row.operator("qt.borrow_reply", text=f"{s.names[to]}: Accept", icon="CHECKMARK")
            op.accept = True
            op = row.operator("qt.borrow_reply", text=f"{s.names[to]}: Reject", icon="CANCEL")
            op.accept = False
            wrapped(pb, context, "Accept: the card goes to your teammate and is played at once. "
                                 "Reject: you keep it; the Borrow card is used up.")
        q = GAME.mate(p)
        box = layout.box()
        box.label(text=f"Teammate {s.names[q]}'s hand ({len(s.hands[q])} cards)", icon="USER")
        opts = set(GAME.borrow_options())
        has_borrow = GAME.card_count("B", p) > 0
        summary = GAME.hand_summary(q)
        if not summary:
            box.label(text="(empty)")
        for kind, n in summary:
            row = box.row(align=True)
            row.label(text=f"{CARD_LABEL[kind]} ×{n}")
            if kind in PLAY_KINDS and s.phase in ("PLAY", "BORROW") and p == s.current:
                cell = row.row(align=True)
                cell.enabled = kind in opts
                op = cell.operator("qt.borrow_request", text="Request", icon="LINKED")
                op.kind = kind
        if s.phase == "PLAY" and p == s.current:
            if has_borrow:
                wrapped(box, context, f"{s.names[p]}: press Request to play a Borrow card for "
                                      "that card.", icon="INFO")
            else:
                wrapped(box, context, f"{s.names[p]} needs a Borrow card to request.", icon="INFO")
        draw_opponents(layout, team)


def draw_opponents(layout, team):
    """Opposing team: card COUNTS only, never card identities."""
    s = GAME.state
    box = layout.box()
    for t in (0, 1):
        if t == team:
            continue
        members = [i for i in range(len(s.names)) if s.team_of[i] == t]
        txt = "  ·  ".join(f"{s.names[i]}: {len(s.hands[i])} cards" for i in members)
        box.label(text=f"{TEAM_NAMES[t]} (hidden): {txt}", icon="HIDE_ON")


class QT_PT_chat(QT_PT_base, Panel):
    bl_idname = "QT_PT_chat"
    bl_label = "Team Chat"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        return ui_mode(context) == MODE_TEAM

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        p = GAME.turn_player()
        if s.mode != MODE_TEAM or p is None:
            layout.label(text="Chat opens during a team game.")
            return
        team = s.team_of[p]
        layout.label(text=f"{TEAM_NAMES[team]} team only (hidden from {TEAM_NAMES[1 - team]})",
                     icon="HIDE_ON")
        box = layout.box()
        msgs = s.chat[team][-8:]
        if not msgs:
            box.label(text="No messages yet.")
        for m in msgs:
            wrapped(box, context, m)
        row = layout.row(align=True)
        row.prop(context.scene.qt_props, "chat_input", text="")
        row.operator("qt.chat_send", text="", icon="FORWARD")
        layout.label(text=f"Sending as {s.names[p]}")


class QT_PT_movement(QT_PT_base, Panel):
    bl_idname = "QT_PT_movement"
    bl_label = "Movement"

    def draw(self, context):
        layout = self.layout
        up, right = view_basis(use_target=True)
        opts = GAME.arrow_options(up, right)

        def arrow(row, d, icon):
            o = opts.get(d)
            cell = row.row(align=True)
            cell.enabled = o is not None
            txt = f"{QUANTUM_STATES[o[0]].label} ({CARD_LABEL[o[1]]})" if o else ""
            op = cell.operator("qt.arrow", text=txt, icon=icon)
            op.direction = d

        col = layout.column(align=True)
        r = col.row(align=True)
        r.label(text="")
        arrow(r, "UP", "TRIA_UP")
        r.label(text="")
        r = col.row(align=True)
        arrow(r, "LEFT", "TRIA_LEFT")
        r.label(text="")
        arrow(r, "RIGHT", "TRIA_RIGHT")
        r = col.row(align=True)
        r.label(text="")
        arrow(r, "DOWN", "TRIA_DOWN")
        r.label(text="")
        wrapped(layout, context, "Arrows follow the camera: UP = away from the camera (in a goal "
                                 "view: toward that endzone). They play a card from your hand "
                                 "whose line points that way and never break the rules.")


class QT_PT_measure(QT_PT_base, Panel):
    bl_idname = "QT_PT_measure"
    bl_label = "Measurement Result"

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        layout.label(text="Play MEASURE from 'Your Hand' above.", icon="INFO")
        if s.position is not None:
            p0, p1 = probabilities(*s.amps)
            row = layout.row()
            row.label(text=f"P(0) = {100 * p0:.0f}%")
            row.label(text=f"P(1) = {100 * p1:.0f}%")
        if s.position in ("0", "1"):
            layout.label(text="Ball at 0/1: measuring = failed punt", icon="INFO")
        if s.last_measure:
            layout.box().label(text=s.last_measure, icon="LIGHT")


class QT_PT_state(QT_PT_base, Panel):
    bl_idname = "QT_PT_state"
    bl_label = "Current State"

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        box = layout.box()
        if s.position is None:
            box.label(text="No kickoff yet")
            return
        st = QUANTUM_STATES[s.position]
        a, b = s.amps
        p0, p1 = probabilities(a, b)
        ph = global_phase_text(a, b, s.position)
        row = box.row()
        row.scale_y = 1.6
        row.label(text=f"{ph}{st.label}", icon="RADIOBUT_ON")
        box.label(text=f"|ψ> = {fmt_c(a)}|0> + {fmt_c(b)}|1>")
        box.label(text=f"P(0) = |α|² = {100 * p0:.0f}%")
        box.label(text=f"P(1) = |β|² = {100 * p1:.0f}%")
        col = box.column(align=True)
        col.scale_y = 0.8
        col.label(text=f"α = {fmt_c(a)}   β = {fmt_c(b)}")
        x, y, z = amps_to_bloch(a, b)
        col.label(text=f"Bloch (x, y, z) = ({x:.0f}, {y:.0f}, {z:.0f})".replace("-0", "0"))
        if ph:
            col.label(text=f"Global phase {ph} does not move the ball.")
        col.label(text="Quantum maths: exact matrices. Board moves: game rule.")


class QT_PT_camera(QT_PT_base, Panel):
    bl_idname = "QT_PT_camera"
    bl_label = "Camera View"

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        s = GAME.state
        col = layout.column(align=True)
        for view, label, icon in CAMERA_VIEWS:
            if view in ("ATTACK_PLUS", "ATTACK_MINUS"):
                t = 0 if view == "ATTACK_PLUS" else 1
                if ui_mode(context) == MODE_TEAM:
                    who = f"{TEAM_NAMES[t]} (P{1 + 2 * t} / P{2 + 2 * t})"
                else:
                    who = (s.names[t] if s.phase != "SETUP"
                           else (p.p1_name if t == 0 else p.p2_name))
                label = f"{label}   {who}"
            op = col.operator("qt.camera_view", text=label, icon=icon)
            op.view = view
        box = layout.box()
        box.label(text="View from a position")
        grid = box.grid_flow(row_major=True, columns=3, even_columns=True, align=True)
        for key in STATE_ORDER:
            op = grid.operator("qt.camera_view", text=QUANTUM_STATES[key].label)
            op.view = f"FROM_{key}"
        layout.label(text="Follow the game:")
        layout.row().prop(p, "camera_follow", expand=True)
        wrapped(layout, context, "Goal view = standing behind the other endzone, looking at "
                                 "the endzone that player/team must reach. The minimap "
                                 "(top-left) turns with the camera.")


class QT_PT_animation(QT_PT_base, Panel):
    bl_idname = "QT_PT_animation"
    bl_label = "Animation & Token"

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        row = layout.row()
        row.scale_y = 1.4
        if _AMB["running"]:
            row.operator("qt.ambient_toggle", text="Stop Animation", icon="PAUSE")
        else:
            row.operator("qt.ambient_toggle", text="Start Animation (loop)", icon="PLAY")
        orbit = p.style == "ORBIT"
        box = layout.box()
        box.label(text="Orbit swirl", icon="FORCE_VORTEX")
        col = box.column(align=True)
        col.enabled = orbit
        col.prop(p, "amb_swirl")
        col.prop(p, "swirl_speed")
        col.prop(p, "swirl_brightness")
        col.prop(p, "swirl_opacity", slider=True)
        box = layout.box()
        box.label(text="Characters", icon="MONKEY")
        col = box.column(align=True)
        col.enabled = orbit
        col.prop(p, "amb_eyes")
        wrapped(col, context, "They make a '> <' face when the token lands on their head.")
        if not orbit:
            layout.label(text="Swirl and characters: Orbit style only", icon="INFO")
        box = layout.box()
        box.label(text="Token shape", icon="SHADING_SOLID")
        box.row().prop(p, "token_shape", expand=True)


class QT_PT_bloch(QT_PT_base, Panel):
    bl_idname = "QT_PT_bloch"
    bl_label = "Bloch Sphere Position"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        col = layout.column(align=True)
        col.prop(p, "bloch_x")
        col.prop(p, "bloch_y")
        col.prop(p, "bloch_z")
        col.prop(p, "bloch_size")
        row = layout.row(align=True)
        row.operator("qt.select_bloch", icon="RESTRICT_SELECT_OFF")
        row.operator("qt.reset_bloch", text="Reset", icon="LOOP_BACK")
        wrapped(layout, context, "Or select it and drag with G - the light beam follows.")


class QT_PT_background(QT_PT_base, Panel):
    bl_idname = "QT_PT_background"
    bl_label = "Background"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        col = layout.column(align=True)
        col.operator("qt.space_background", icon="WORLD")
        col.operator("qt.hdri_background", icon="IMAGE_DATA")
        col.operator("qt.restore_background", icon="LOOP_BACK")
        layout.prop(p, "bg_strength")
        layout.prop(p, "bg_rotation")
        wrapped(layout, context, "Shown in Rendered view (Z key). In Material Preview the "
                                 "button switches on 'World' for you.")


class QT_PT_history(QT_PT_base, Panel):
    bl_idname = "QT_PT_history"
    bl_label = "Move History"

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        entries = GAME.history.entries
        if not entries:
            layout.label(text="No moves yet.")
        else:
            box = layout.box()
            col = box.column(align=True)
            col.scale_y = 0.8
            shown = entries[-p.history_rows:]
            if len(entries) > len(shown):
                col.label(text=f"... {len(entries) - len(shown)} earlier lines")
            for line in shown:
                col.label(text=line)
        layout.prop(p, "history_rows")
        row = layout.row()
        row.scale_y = 1.3
        row.operator("qt.reset_game", icon="LOOP_BACK")
        if GAME.state.cards == "PHYSICAL" and GAME.state.phase in ("PLAY", "KICKOFF"):
            layout.operator("qt.finish_game", icon="CHECKMARK")


class QT_PT_settings(QT_PT_base, Panel):
    bl_idname = "QT_PT_settings"
    bl_label = "Rules & Settings"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        p = context.scene.qt_props
        team = p.game_mode == "TEAM"
        box = layout.box()
        box.label(text="Players (team mode)" if team else "Players (solo)", icon="USER")
        for name in (("t1_name", "t2_name", "t3_name", "t4_name") if team
                     else ("p1_name", "p2_name")):
            box.prop(p, name)
        layout.prop(p, "anim_speed")

        box = layout.box()
        counts = deck_counts_from_props(p)
        gates = sum(v for k, v in counts.items() if k != "B")
        total = gates + (counts["B"] if team else 0)
        rule = "52 + 3 Borrow = 55" if team else "52"
        box.label(text=f"Deck composition (total {total}, rules: {rule})")
        grid = box.grid_flow(columns=2, align=True)
        for c in CARD_ORDER:
            cell = grid.row(align=True)
            if c == "B":
                cell.enabled = team
            cell.prop(p, f"deck_{c.lower()}")
        wrapped(box, context, "Default deck: H 7, S 7, X 4, Y 9, Z 7, I 3, Measure 3, "
                              "√X 12 = 52 cards; team mode adds Borrow 3. Applied at "
                              "Start Game.", icon="INFO")

        box = layout.box()
        box.label(text="Match limits (0 = off)", icon="TIME")
        row = box.row(align=True)
        row.label(text="Solo:")
        row.prop(p, "solo_target", text="Target")
        row.prop(p, "solo_time", text="Min")
        row = box.row(align=True)
        row.label(text="Team:")
        row.prop(p, "team_target", text="Target")
        row.prop(p, "team_time", text="Min")
        box.prop(p, "tie_break")
        sub = box.row()
        sub.enabled = p.tie_break
        sub.prop(p, "sudden_death")
        wrapped(box, context, "The game also ends when every card has been played (no "
                              "reshuffle). Solo with both limits off = the original game.")

        box = layout.box()
        box.label(text="Rule notes", icon="INFO")
        wrapped(box, context, "Touchdown only when you move the ball INTO your own (team's) "
                              "endzone on your turn. A ball pushed into your endzone by the "
                              "opponent does not score: move it out, then back in.")
        if team:
            wrapped(box, context, "Team: dice decide who kicks off; order P1 → P3 → P2 → P4. "
                                  "Borrow asks your teammate for one card: accept = it is "
                                  "played at once; reject = Borrow is used up and you still "
                                  "play your own card. No passing.")
        layout.prop(p, "debug_mode")
        layout.operator("qt.self_test", icon="CHECKBOX_HLT")


class QT_PT_debug(QT_PT_base, Panel):
    bl_idname = "QT_PT_debug"
    bl_label = "Debug (counts only)"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        return context.scene.qt_props.debug_mode

    def draw(self, context):
        layout = self.layout
        s = GAME.state
        c = GAME.census()
        col = layout.column(align=True)
        col.label(text=f"Mode {s.mode} · cards {s.cards} · phase {s.phase}")
        col.label(text=f"Current {s.names[s.current] if s.current < len(s.names) else '-'} · "
                       f"kicker {s.names[s.kicker] if s.kicker < len(s.names) else '-'}")
        col.label(text=f"Deck {c['deck']} · discard {c['discard']}")
        col.label(text="Hands: " + "  ".join(f"{s.names[i]} {n}" for i, n in enumerate(c["hands"])))
        ok = c["total"] == c["expected"] and c["duplicates"] == 0
        col.label(text=f"Total {c['total']} / {c['expected']} · duplicates {c['duplicates']}",
                  icon="CHECKMARK" if ok else "ERROR")
        col.label(text=f"Borrow pending: {'yes' if s.pending else 'no'}")
        col.label(text=f"Clock {s.elapsed:.0f}s / {s.time_limit:.0f}s")
        col.label(text="Card identities are never shown here.")


# =============================================================================
# TESTS
# =============================================================================

def _set_kinds(hand, kinds):
    """Test helper: give the cards in a hand specific kinds."""
    for c, k in zip(hand, kinds):
        c.kind = k


def run_self_test():
    lines, ok = [], True

    def check(name, cond):
        nonlocal ok
        ok = ok and bool(cond)
        lines.append(("PASS  " if cond else "FAIL  ") + name)

    # 1. Matrix maths reproduces every line/arrow of the original board.
    mism = [(s, g) for s in STATE_ORDER for g in GATE_CARDS
            if gate_destination(g, s) != BOARD_TABLE[s][g]]
    check(f"All 42 gate transitions match the board ({len(mism)} mismatches)", not mism)
    for s, g, e in (("0", "H", "+"), ("+", "Z", "-"), ("0", "X", "1"), ("1", "X", "0"),
                    ("0", "SX", "-i"), ("-i", "SX", "1"), ("0", "I", "0")):
        check(f"|{s}> + {CARD_ASCII[g]} -> |{e}>", gate_destination(g, s) == e)
    check("Y|0> = i|1> (global phase only)",
          global_phase_text(*apply_gate("Y", (1, 0)), "1") == "i")

    # 2. Gates keep the state normalised and the Bloch rotation agrees with them.
    worst = 0.0
    for s in STATE_ORDER:
        for g in GATE_CARDS:
            axis, ang = GATE_ROTATIONS[g]
            v = rotate_vector(QUANTUM_STATES[s].bloch, axis, ang)
            worst = max(worst, (v - Vector(QUANTUM_STATES[gate_destination(g, s)].bloch)).length)
    check(f"Animated rotation ends on the computed state (max err {worst:.1e})", worst < 1e-5)

    # 3. Measurement.
    rng = random.Random(7)
    g = QuantumGame(rng)
    for start, expect in (("0", {"0"}), ("1", {"1"})):
        seen = set()
        for _ in range(200):
            g.new_game(MODE_SOLO, "PHYSICAL")
            g.kickoff(int(start))
            g.play_card("M")
            seen.add(g.state.position)
        check(f"Measure at |{start}> always stays |{start}> (failed punt)", seen == expect)
    zeros = 0
    n = 4000
    for _ in range(n):
        g.new_game(MODE_SOLO, "PHYSICAL")
        g.kickoff(0)
        g.state.position = "i"
        g.state.amps = QUANTUM_STATES["i"].amps
        g.play_card("M")
        zeros += g.state.position == "0"
    check(f"Measure at |i> gives 0 about 50% ({zeros / n:.3f})", 0.45 < zeros / n < 0.55)
    kick = sum(QuantumGame(rng).roll_binary_die() == 0 for _ in range(n))
    check(f"Binary die is 50:50 ({kick / n:.3f})", 0.45 < kick / n < 0.55)

    # 4. Solo: turn structure, touchdown and kickoff (unchanged rules).
    g = QuantumGame(random.Random(1))
    g.new_game(MODE_SOLO, "PHYSICAL")
    check("Solo: kicker P1, game waits for kickoff", g.state.phase == "KICKOFF")
    g.kickoff(0)
    check("After kickoff the OTHER player (P2) plays", g.state.current == P2)
    g.play_card("H")                       # P2: 0 -> + (P1's endzone)
    check("P2 pushes ball into P1's endzone: no score, ball stays at +",
          g.state.scores == [0, 0] and g.state.position == "+" and g.state.phase == "PLAY")
    check("...and it is P1's turn", g.state.current == P1)
    g.play_card("I")                       # P1: stays at + (did not enter)
    check("P1 leaving the ball in own endzone (I) does not score", g.state.scores == [0, 0])
    g.play_card("Y")                       # P2: + -> - (own endzone, entered)
    check("P2 moves it from + into own endzone - : P2 scores", g.state.scores == [0, 1])
    check("Scorer (P2) kicks off next", g.state.phase == "KICKOFF" and g.state.kicker == P2)
    g.kickoff(1)
    check("...then P1 plays", g.state.current == P1)
    g.play_card("H")                       # P1: 1 -> - (P2's endzone)
    check("P1 pushes ball into P2's endzone: no score", g.state.scores == [0, 1])
    g.play_card("H")                       # P2: - -> 1 (out)
    g.play_card("H")                       # P1: 1 -> - again: still P2's endzone, no score
    check("Repeated push into opponent's endzone still no score", g.state.scores == [0, 1])
    g.play_card("Z")                       # P2 at - Z: - -> +
    check("P2 moves it out to + (P1's endzone): no score", g.state.scores == [0, 1])
    g.play_card("X")                       # P1: X at + stays -> no score
    check("X keeps the ball at + (no line): no score", g.state.scores == [0, 1])
    g.play_card("Y")                       # P2: + -> - : enters own endzone
    check("P2 then re-enters - from outside: scores", g.state.scores == [0, 2])
    g.kickoff(0)
    g.play_card("H")                       # P1: 0 -> + : P1's own endzone
    check("P1 moves 0 -> + into own endzone: P1 scores", g.state.scores == [1, 2])

    # 5. Solo full digital games: every card played exactly once, consistent scores.
    for seed in range(30):
        g = QuantumGame(random.Random(seed))
        g.new_game(MODE_SOLO, "DIGITAL", DEFAULT_DECK, first_kicker=P1 if seed % 2 else P2)
        played, guard = 0, 0
        while g.state.phase != "GAME_OVER" and guard < 500:
            guard += 1
            if g.state.phase == "KICKOFF":
                g.kickoff()
                continue
            g.play_card(g.rng.choice(g.playable_cards()))
            played += 1
        tds = sum(1 for e in g.history.entries if "TOUCHDOWN" in e)
        c = g.census()
        good = (played == DECK_SIZE and not g.state.deck and not any(g.state.hands)
                and sum(g.state.scores) == tds and c["discard"] == DECK_SIZE
                and c["duplicates"] == 0)
        if not good:
            check(f"Solo random game seed {seed}", False)
            break
    else:
        check("30 solo games: 52 cards played once each (no Borrow), scores = touchdowns", True)

    # 6. Hand rules.
    g = QuantumGame(random.Random(3))
    g.new_game(MODE_SOLO, "DIGITAL", DEFAULT_DECK)
    check("Solo: 4 cards each, draw pile 44, no Borrow cards",
          len(g.state.hands[P1]) == 4 and len(g.state.hands[P2]) == 4 and len(g.state.deck) == 44
          and g.state.total_cards == 52)
    g.kickoff(0)
    missing = next((c for c in PLAY_KINDS if not g.card_count(c, P2)), None)
    if missing:
        ev, err = g.play_card(missing)
        check("Cannot play a card you don't hold", ev is None and err)
    g.play_card(g.state.hands[P2][0].kind)
    check("Hand refilled to 4 after playing", len(g.state.hands[P2]) == 4)
    g.new_game(MODE_SOLO, "DIGITAL", DEFAULT_DECK)
    check("New game / reset clears history and scores",
          g.history.entries == [] and g.state.scores == [0, 0] and g.state.position is None)

    # 7. Team mode: setup, dice, turn order.
    g = QuantumGame(random.Random(4))
    g.new_game(MODE_TEAM, deck_counts=DEFAULT_DECK)
    check("Team: 55 cards (52 + 3 Borrow), 4 x 4 cards dealt, draw pile 39",
          g.state.total_cards == 55 and all(len(h) == 4 for h in g.state.hands)
          and len(g.state.deck) == 39)
    check("Team game starts with the team dice", g.state.phase == "ROLL")
    check("Cannot kick off or play before the dice", g.kickoff()[0] is None and g.play_card("H")[0] is None)
    g.roll_team(TEAM_BLUE, 3)
    check("A team cannot roll twice", g.roll_team(TEAM_BLUE, 5)[0] is None)
    g.roll_team(TEAM_RED, 3)
    check("Tied dice: both teams roll again", g.state.phase == "ROLL" and g.state.dice == [None, None])
    g.roll_team(TEAM_RED, 6)
    g.roll_team(TEAM_BLUE, 2)
    check("Red wins the roll -> P3 kicks off", g.state.phase == "KICKOFF" and g.state.kicker == P3)
    g.kickoff(0)
    check("After P3's kickoff, P2 (next in P1-P3-P2-P4) plays", g.state.current == P2)
    seq = []
    for _ in range(4):
        seq.append(g.state.current)
        g.state.hands[g.state.current][0].kind = "I"      # no movement, no scoring
        g.play_card("I")
    check(f"Turn order P2 -> P4 -> P1 -> P3 ({seq})", seq == [P2, P4, P1, P3])
    g2 = QuantumGame(random.Random(9))
    g2.new_game(MODE_TEAM)
    g2.roll_team(TEAM_BLUE, 5)
    g2.roll_team(TEAM_RED, 1)
    check("Blue wins the roll -> P1 kicks off, then P3 plays",
          g2.state.kicker == P1 and g2.kickoff(1)[0] is not None and g2.state.current == P3)

    # 8. Team: Borrow accepted.
    g = QuantumGame(random.Random(5))
    g.new_game(MODE_TEAM)
    g.roll_team(TEAM_BLUE, 6)
    g.roll_team(TEAM_RED, 1)
    g.kickoff(0)                               # P1 kicks off -> P3 plays
    s = g.state
    _set_kinds(s.hands[P3], ["B", "I", "I", "I"])
    _set_kinds(s.hands[P4], ["H", "X", "Z", "Y"])
    deck0, disc0 = len(s.deck), len(s.discard)
    check("Borrow from the other team is impossible (teammate only)", g.mate(P3) == P4)
    check("Cannot request a card the teammate does not hold", g.request_borrow("S")[0] is None)
    ev, err = g.request_borrow("H")
    check("P3 plays Borrow asking P4 for H: request pending",
          err is None and s.phase == "BORROW" and len(s.hands[P3]) == 3 and len(s.discard) == disc0 + 1)
    check("Public history does not reveal the requested card",
          g.history.entries[-1].endswith("asks P4 for a card"))
    check("No other card can be played while a request is pending", g.play_card("I")[0] is None)
    ev, err = g.respond_borrow(True)
    check("Accepted: borrowed H played at once, 0 -> +",
          err is None and s.position == "+" and "borrowed from P4" in " ".join(g.history.entries))
    check("Red pushed the ball into Blue's endzone: no score", s.scores == [0, 0])
    check("Both refilled to 4, two cards drawn, Borrow + H discarded",
          len(s.hands[P3]) == 4 and len(s.hands[P4]) == 4 and len(s.deck) == deck0 - 2
          and len(s.discard) == disc0 + 2)
    check("Turn passes to P2 after the borrowed card (no extra turn)", s.current == P2)

    # 9. Team: Borrow rejected, must still play.
    _set_kinds(s.hands[P2], ["B", "Z", "I", "I"])
    _set_kinds(s.hands[P1], ["X", "I", "I", "I"])
    g.request_borrow("X")
    ev, err = g.respond_borrow(False)
    check("Rejected: Borrow used up, P2 keeps the turn with 3 cards, P1 keeps the X",
          err is None and s.phase == "PLAY" and s.current == P2 and len(s.hands[P2]) == 3
          and g.card_count("X", P1) == 1 and len(s.hands[P1]) == 4)
    check("Borrow card itself cannot be played onto the board", g.play_card("B")[0] is None)
    g.play_card("Z")                           # P2 (Blue): + -> - (Red's endzone)
    check("P2 then plays Z (+ -> -): no score for Blue, refilled to 4, next is P4",
          s.position == "-" and s.scores == [0, 0] and len(s.hands[P2]) == 4 and s.current == P4)
    c = g.census()
    check("Card census after Borrow: 55 cards, no duplicates",
          c["total"] == 55 and c["duplicates"] == 0)

    # 10. Team touchdown and kickoff.
    _set_kinds(s.hands[P4], ["H", "I", "I", "I"])
    g.play_card("H")                           # P4 (Red): - -> 1 (leaves own endzone)
    _set_kinds(s.hands[P1], ["H", "I", "I", "I"])
    g.play_card("H")                           # P1 (Blue): 1 -> - (Red's endzone, no score)
    _set_kinds(s.hands[P3], ["H", "I", "I", "I"])
    g.play_card("H")                           # P3 (Red): - -> 1
    _set_kinds(s.hands[P2], ["X", "I", "I", "I"])
    g.play_card("X")                           # P2: 1 -> 0
    _set_kinds(s.hands[P4], ["I", "I", "I", "I"])
    g.play_card("I")                           # P4: stays 0
    _set_kinds(s.hands[P1], ["H", "I", "I", "I"])
    g.play_card("H")                           # P1 (Blue): 0 -> + : Blue scores
    check("Blue (P1) moves 0 -> + : Blue scores", s.scores == [1, 0])
    check("Scorer P1 kicks off, then P3 plays",
          s.phase == "KICKOFF" and s.kicker == P1 and g.kickoff(0)[0] is not None and s.current == P3)

    # 11. Target score ends the game.
    g = QuantumGame(random.Random(6))
    g.new_game(MODE_TEAM, target=1)
    g.roll_team(TEAM_BLUE, 2)
    g.roll_team(TEAM_RED, 4)
    g.kickoff(0)                               # P3 kicks off -> P2 (Blue) plays
    _set_kinds(g.state.hands[P2], ["H", "I", "I", "I"])
    g.play_card("H")
    check("Target 1 reached -> game over, Blue wins",
          g.state.phase == "GAME_OVER" and g.state.winner == TEAM_BLUE)

    # 12. Timer and Quantum Challenge.
    g = QuantumGame(random.Random(8))
    g.new_game(MODE_SOLO, "PHYSICAL", time_limit=10, tie_break=True)
    check("Clock runs once the match starts", not g.tick(4) and abs(g.time_left() - 6) < 1e-9)
    g.kickoff(0)
    g.state.clock_paused = True
    check("Paused clock does not run", not g.tick(50) and abs(g.time_left() - 6) < 1e-9)
    g.state.clock_paused = False
    check("Time up after the limit", g.tick(7))
    g.time_up()
    check("Tied 0-0 at time up -> Quantum Challenge", g.state.phase == "CHALLENGE")
    for _ in range(5):
        g.answer_challenge(0, g.state.challenge["current"]["answer"])
    check("Player 1 answers 5 right -> wins the challenge 5-0",
          g.state.phase == "GAME_OVER" and g.state.winner == 0
          and g.state.challenge["scores"] == [5, 0])

    g = QuantumGame(random.Random(10))
    g.new_game(MODE_TEAM, time_limit=5, tie_break=True, sudden_death=True)
    check("Team clock does not run during the dice roll", not g.tick(20) and g.state.elapsed == 0)
    g.roll_team(0, 6)
    g.roll_team(1, 1)
    g.kickoff(0)
    g.tick(6)
    g.time_up()
    ch = g.state.challenge
    wrong = (ch["current"]["answer"] + 1) % 4
    g.answer_challenge(0, wrong)
    check("Wrong answer locks that team out of the question",
          ch["locked"][0] and g.answer_challenge(0, ch["current"]["answer"])[0] is None)
    g.answer_challenge(1, wrong)
    check("Both wrong -> no point, next question", ch["current"]["number"] == 2 and ch["scores"] == [0, 0])
    for _ in range(4):
        g.skip_question()
    check("Still tied after 5 -> sudden-death question", g.state.phase == "CHALLENGE" and ch["sudden"])
    g.answer_challenge(1, ch["current"]["answer"])
    check("Red answers the sudden-death question -> Red wins",
          g.state.phase == "GAME_OVER" and g.state.winner == TEAM_RED)

    g = QuantumGame(random.Random(11))
    g.new_game(MODE_SOLO, "PHYSICAL", time_limit=5, tie_break=True, sudden_death=False)
    g.kickoff(1)
    g.tick(9)
    g.time_up()
    for _ in range(5):
        g.skip_question()
    check("Tied challenge without sudden death -> draw (no invented winner)",
          g.state.phase == "GAME_OVER" and g.state.winner == -1)
    g = QuantumGame(random.Random(12))
    g.new_game(MODE_SOLO, "PHYSICAL", time_limit=5, tie_break=False)
    g.kickoff(1)
    g.tick(9)
    g.time_up()
    check("Tie-break off -> tie reported", g.state.phase == "GAME_OVER" and g.state.winner == -1)

    bank_ok = len(QUANTUM_QUESTIONS) >= 10 and all(
        0 <= q["answer"] < len(q["options"]) and len(set(q["options"])) == len(q["options"])
        for q in QUANTUM_QUESTIONS)
    check(f"Question bank: {len(QUANTUM_QUESTIONS)} questions, answers valid", bank_ok)

    # 13. Team full random games with Borrow: no card loss, always terminates.
    problems = []
    for seed in range(40):
        g = QuantumGame(random.Random(100 + seed))
        g.new_game(MODE_TEAM)
        guard = 0
        while g.state.phase != "GAME_OVER" and guard < 3000:
            guard += 1
            st = g.state
            if st.phase == "ROLL":
                g.roll_team(0 if st.dice[0] is None else 1)
            elif st.phase == "KICKOFF":
                g.kickoff()
            elif st.phase == "BORROW":
                g.respond_borrow(g.rng.random() < 0.5)
            elif st.phase == "PLAY":
                opts = g.borrow_options()
                kinds = g.playable_cards()
                if opts and (not kinds or g.rng.random() < 0.3):
                    g.request_borrow(g.rng.choice(opts))
                elif g.can_discard_borrow():
                    g.discard_borrow()
                elif kinds:
                    g.play_card(g.rng.choice(kinds))
                else:
                    problems.append(f"seed {seed}: stuck")
                    break
            c = g.census()
            if c["total"] != 55 or c["duplicates"] or any(n > HAND_SIZE for n in c["hands"]):
                problems.append(f"seed {seed}: census {c}")
                break
        c = g.census()
        if g.state.phase != "GAME_OVER" or c["discard"] != 55:
            problems.append(f"seed {seed}: ended {g.state.phase}, discard {c['discard']}")
        if problems:
            break
    check("40 team games with Borrow: 55 cards conserved, all played, always ends"
          + (f" ({problems[0]})" if problems else ""), not problems)

    # 14. Arrows follow the camera.
    g = QuantumGame(random.Random(2))
    g.new_game(MODE_SOLO, "PHYSICAL")
    g.kickoff(0)
    top = g.arrow_options()
    flipped = g.arrow_options(Vector((0, -1, 0)), Vector((-1, 0, 0)))
    check("Arrows: top view UP from |0> reaches |+>; flipped view DOWN does the same",
          top.get("UP", (None,))[0] == "+" and flipped.get("DOWN", (None,))[0] == "+")
    return ok, lines


# =============================================================================
# REGISTRATION / INITIALIZATION
# =============================================================================

classes = (
    QT_Properties,
    QT_OT_build_scene, QT_OT_start_game, QT_OT_roll_team, QT_OT_kickoff, QT_OT_play_card,
    QT_OT_borrow_request, QT_OT_borrow_reply, QT_OT_discard_borrow, QT_OT_arrow,
    QT_OT_challenge_answer, QT_OT_challenge_skip, QT_OT_chat_send, QT_OT_clock_toggle,
    QT_OT_finish, QT_OT_reset_game, QT_OT_camera, QT_OT_cleanup_legacy,
    QT_OT_space_background, QT_OT_hdri_background, QT_OT_restore_background,
    QT_OT_reset_bloch, QT_OT_select_bloch, QT_OT_ambient_toggle, QT_OT_self_test,
    QT_PT_main, QT_PT_result, QT_PT_challenge, QT_PT_gates, QT_PT_team, QT_PT_chat,
    QT_PT_movement, QT_PT_measure, QT_PT_state, QT_PT_camera, QT_PT_animation,
    QT_PT_bloch, QT_PT_background, QT_PT_history, QT_PT_settings, QT_PT_debug,
)


def register():
    stop_animations()
    stop_ambient(reset=False)
    stop_clock()
    if hasattr(bpy.types.Scene, "qt_props"):
        try:
            del bpy.types.Scene.qt_props
        except Exception:
            pass
    for old in reversed(bpy.app.driver_namespace.get("qt_registered_classes", [])):
        try:
            bpy.utils.unregister_class(old)
        except Exception:
            pass
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.app.driver_namespace["qt_registered_classes"] = list(classes)
    bpy.types.Scene.qt_props = PointerProperty(type=QT_Properties)
    _remove_handlers()
    bpy.app.handlers.depsgraph_update_post.append(_qt_depsgraph_handler)


def _remove_handlers():
    hs = bpy.app.handlers.depsgraph_update_post
    for h in list(hs):
        if getattr(h, "__name__", "") == "_qt_depsgraph_handler":
            hs.remove(h)


def unregister():
    stop_animations()
    stop_ambient(reset=False)
    stop_clock()
    _remove_handlers()
    if hasattr(bpy.types.Scene, "qt_props"):
        del bpy.types.Scene.qt_props
    for cls in reversed(classes):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass
    bpy.app.driver_namespace["qt_registered_classes"] = []


if __name__ == "__main__":
    register()
    ok, report = run_self_test()
    print("\n=== Qubit Touchdown self-test ===")
    for line in report:
        print(line)
    print("ALL TESTS PASSED" if ok else "SOME TESTS FAILED")
    build_scene(bpy.context.scene)
    set_banner("QUBIT TOUCHDOWN")
    _old = legacy_objects(bpy.context.scene)
    if _old:
        print(f"WARNING: {len(_old)} QT_ objects from another script are in the scene:",
              [o.name for o in _old], "- use 'Delete Old QT_ Objects' in the panel.")
    print("Qubit Touchdown ready: View3D > Sidebar (N) > Qubit Touchdown")