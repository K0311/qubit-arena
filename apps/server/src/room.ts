import {
  defaultConfig,
  sideOf,
  TURN_ORDER,
  type GameConfig,
  type GameState,
  type Mode,
  type PlayerId,
  type Rng,
  type Side,
} from '@qa/engine';
import type { Room as RoomInfo, RoomSettings } from '@qa/protocol';
import type { TimerHandle } from './scheduler';

export interface Connection {
  send(text: string): void;
  close(): void;
}

/** One browser tab. Survives reconnects: the token in WELCOME finds it again. */
export type Session = {
  readonly id: number;
  readonly token: string;
  name: string;
  conn: Connection | null;
  room: Room | null;
};

export type Seat = {
  session: Session;
  ready: boolean;
  /** Left with LEAVE during a game; the seat stays theirs (rules.md §10). */
  left: boolean;
  /** A bot is playing for this seat (rules.md §10). */
  bot: boolean;
};

export type Role = PlayerId | 'SPECTATOR';
export type RoomStatus = RoomInfo['status'];

/** Room settings over the engine defaults (rules.md §5). */
export function roomConfig(mode: Mode, settings: RoomSettings = {}): GameConfig {
  const base = defaultConfig(mode);
  return {
    ...base,
    targetScore: settings.targetScore ?? base.targetScore,
    timeLimitMs: settings.timeLimitMs ?? base.timeLimitMs,
    turnTimerMs: settings.turnTimerMs ?? base.turnTimerMs,
    suddenDeath: settings.suddenDeath ?? base.suddenDeath,
    deckCounts: settings.deckCounts ?? base.deckCounts,
  };
}

export class Room {
  readonly seats = new Map<PlayerId, Seat | null>();
  readonly spectators = new Set<Session>();
  status: RoomStatus = 'WAITING';
  host: Session | null = null;
  state: GameState | null = null;
  rng: Rng | null = null;
  /** stateVersion on ROOM_STATE, GAME_VIEW and EVENT (architecture.md §5). */
  version = 0;
  readonly timers: {
    game?: TimerHandle;
    turn?: TimerHandle;
    bot?: TimerHandle;
    seats: Map<PlayerId, TimerHandle>;
  } = { seats: new Map() };

  constructor(
    readonly code: string,
    readonly name: string,
    readonly mode: Mode,
    readonly visibility: RoomInfo['visibility'],
    readonly config: GameConfig,
    /** Made by QUICK_MATCH: players arrive ready and the game starts when full. */
    readonly quick = false,
  ) {
    for (const p of this.seatIds()) this.seats.set(p, null);
  }

  seatIds(): PlayerId[] {
    return [...TURN_ORDER[this.mode]].sort();
  }

  seatOf(session: Session): PlayerId | undefined {
    for (const [p, seat] of this.seats) if (seat?.session === session) return p;
    return undefined;
  }

  roleOf(session: Session): Role | null {
    if (this.spectators.has(session)) return 'SPECTATOR';
    const p = this.seatOf(session);
    return p && !this.seats.get(p)?.left ? p : null;
  }

  sideOf(p: PlayerId): Side {
    return sideOf(this.mode, p);
  }

  freeSeat(): PlayerId | undefined {
    return this.seatIds().find((p) => this.seats.get(p) === null);
  }

  isFull(): boolean {
    return this.freeSeat() === undefined;
  }

  isConnected(seat: Seat): boolean {
    return !seat.left && seat.session.conn !== null && seat.session.room === this;
  }

  /** Everyone in the room who can receive messages right now. */
  members(): Session[] {
    const out: Session[] = [];
    for (const seat of this.seats.values()) {
      if (seat && this.isConnected(seat)) out.push(seat.session);
    }
    for (const s of this.spectators) if (s.conn) out.push(s);
    return out;
  }

  /**
   * Nobody is here any more. A running game survives everyone dropping at once (they can
   * reconnect, and bots play meanwhile) unless every player has left on purpose.
   */
  isEmpty(): boolean {
    if (this.members().length > 0) return false;
    if (this.status !== 'PLAYING') return true;
    return [...this.seats.values()].every((s) => !s || s.left);
  }

  info(): RoomInfo {
    const seats: RoomInfo['seats'] = {};
    for (const [p, seat] of this.seats) {
      seats[p] = seat && {
        name: seat.session.name,
        ready: seat.ready,
        connected: this.isConnected(seat),
        bot: seat.bot,
        host: seat.session === this.host,
      };
    }
    return {
      code: this.code,
      name: this.name,
      mode: this.mode,
      visibility: this.visibility,
      status: this.status,
      settings: this.config,
      seats,
      spectators: this.spectators.size,
    };
  }
}
