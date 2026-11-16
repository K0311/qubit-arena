import { z } from 'zod';
import type { GameEvent, GameView } from '@qa/engine';
import {
  ballPositionSchema,
  botLevelSchema,
  cardKindSchema,
  chatTextSchema,
  count,
  endReasonSchema,
  kickoffPositionSchema,
  modeSchema,
  phaseSchema,
  playerNameSchema,
  roomCodeSchema,
  roomNameSchema,
  seatSchema,
  sideRecord,
  sideSchema,
  stateVersionSchema,
  visibilitySchema,
  winnerSchema,
} from './shared';

export const PROTOCOL_VERSION = 1;

const cardSchema = z.strictObject({ id: z.number().int().positive(), kind: cardKindSchema });
const complexSchema = z.strictObject({ re: z.number(), im: z.number() });

export const gameConfigSchema = z.strictObject({
  mode: modeSchema,
  targetScore: z.number().int().positive(),
  timeLimitMs: count,
  turnTimerMs: count,
  handSize: z.number().int().positive(),
  deckCounts: z.record(cardKindSchema, count),
  suddenDeath: z.boolean(),
  challengeQuestions: z.number().int().positive(),
});

export const gameEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('OPENING_ROLL'),
    blue: z.number().int().min(1).max(6),
    red: z.number().int().min(1).max(6),
  }),
  z.strictObject({
    type: z.literal('KICKOFF'),
    side: sideSchema.optional(),
    ball: kickoffPositionSchema,
  }),
  z.strictObject({
    type: z.literal('CARD_PLAYED'),
    player: seatSchema,
    card: cardSchema,
    from: ballPositionSchema,
    to: ballPositionSchema,
    byTimeout: z.boolean(),
  }),
  z.strictObject({ type: z.literal('MEASURED'), outcome: kickoffPositionSchema }),
  z.strictObject({ type: z.literal('TOUCHDOWN'), side: sideSchema, player: seatSchema }),
  z.strictObject({ type: z.literal('TIME_UP') }),
  z.strictObject({ type: z.literal('CHALLENGE_STARTED'), questions: z.number().int().positive() }),
  z.strictObject({
    type: z.literal('CHALLENGE_ANSWERED'),
    side: sideSchema,
    player: seatSchema,
  }),
  z.strictObject({
    type: z.literal('CHALLENGE_RESULT'),
    questionId: z.string().min(1),
    correctChoice: count,
    correct: sideRecord(z.boolean()),
    explanation: z.string().min(1).max(300),
  }),
  z.strictObject({ type: z.literal('GAME_OVER'), reason: endReasonSchema, winner: winnerSchema }),
]) satisfies z.ZodType<GameEvent>;

/**
 * What one connection may see (rules.md §9), mirroring the engine's viewFor(). Strict, so a
 * server bug that adds the deck, the seed or a quiz answer fails validation (T-S-03).
 */
export const gameViewSchema = z.strictObject({
  viewer: z.union([seatSchema, z.literal('SPECTATOR')]),
  config: gameConfigSchema,
  phase: phaseSchema,
  turn: seatSchema,
  score: sideRecord(count),
  qubits: z.array(complexSchema).length(4),
  ball: ballPositionSchema,
  partner: ballPositionSchema,
  hands: z.partialRecord(seatSchema, z.array(cardSchema)),
  handCounts: z.partialRecord(seatSchema, count),
  deckCount: count,
  discard: z.array(cardSchema),
  timeUp: z.boolean(),
  log: z.array(gameEventSchema),
  version: count,
  endReason: endReasonSchema.optional(),
  winner: winnerSchema.optional(),
  challenge: z
    .strictObject({
      index: count,
      scores: sideRecord(count),
      answered: sideRecord(z.boolean()),
      sideChoice: z.number().int().min(0).max(5).optional(),
      question: z.strictObject({
        id: z.string().min(1),
        prompt: z.string().min(1),
        choices: z.array(z.string()).min(2).max(6),
      }),
    })
    .optional(),
}) satisfies z.ZodType<GameView>;

/**
 * Clock readings at the moment the server sent a GAME_VIEW (ui-spec §7.1 clocks, §7.5 log).
 * Remaining times rather than wall-clock deadlines, so the client never depends on its own
 * clock matching the server's; it counts down locally from these values.
 */
export const clocksSchema = z.strictObject({
  /** Match time left. */
  gameMs: count,
  /** Turn time left; null when no turn timer runs (Challenge, finished game). */
  turnMs: count.nullable(),
  /** Match time left when each entry of view.log happened (same length as view.log). */
  logGameMs: z.array(count),
});

const seatInfoSchema = z.strictObject({
  name: playerNameSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  bot: z.boolean(),
  host: z.boolean(),
});

/** Lobby / room before the game (ui-spec §6). Seats not used by the mode are absent. */
export const roomSchema = z.strictObject({
  code: roomCodeSchema,
  name: roomNameSchema,
  mode: modeSchema,
  visibility: visibilitySchema,
  status: z.enum(['WAITING', 'PLAYING', 'FINISHED']),
  settings: gameConfigSchema,
  seats: z.partialRecord(seatSchema, seatInfoSchema.nullable()),
  spectators: count,
  /** Bot strength in this room (P-6.4); host may change it before the game. */
  botLevel: botLevelSchema,
});

/** One row of the lobby list (ui-spec §5): counts only, never who sits where. */
export const roomSummarySchema = z.strictObject({
  code: roomCodeSchema,
  name: roomNameSchema,
  mode: modeSchema,
  status: z.enum(['WAITING', 'PLAYING', 'FINISHED']),
  players: count,
  seats: z.union([z.literal(2), z.literal(4)]),
  spectators: count,
  settings: gameConfigSchema,
});

const ENGINE_ERROR_CODES = [
  'UNKNOWN_ACTION',
  'WRONG_PHASE',
  'NOT_YOUR_TURN',
  'NOT_SEATED',
  'CARD_NOT_IN_HAND',
  'EMPTY_HAND',
  'WRONG_QUESTION',
  'ALREADY_ANSWERED',
  'BAD_CHOICE',
] as const;
const PROTOCOL_ERROR_CODES = [
  'BAD_MESSAGE',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'SEAT_TAKEN',
  'NOT_HOST',
  'NOT_IN_ROOM',
  'NOT_ALL_READY',
  'GAME_IN_PROGRESS',
  'RATE_LIMITED',
] as const;
export const errorCodeSchema = z.enum([...ENGINE_ERROR_CODES, ...PROTOCOL_ERROR_CODES]);
export const engineErrorCodeSchema = z.enum(ENGINE_ERROR_CODES);

export const serverMessageSchema = z.discriminatedUnion('type', [
  /**
   * First message on every connection. The client keeps the token and reconnects with it to
   * get its seat back (rules.md §10, T-S-06). Not in the original §5 list.
   */
  z.strictObject({
    type: z.literal('WELCOME'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    token: z.string().min(16).max(128),
  }),
  z.strictObject({
    type: z.literal('ROOM_STATE'),
    stateVersion: stateVersionSchema,
    room: roomSchema,
    you: z.strictObject({
      seat: z.union([seatSchema, z.literal('SPECTATOR'), z.null()]),
      host: z.boolean(),
    }),
  }),
  z.strictObject({
    type: z.literal('GAME_VIEW'),
    stateVersion: stateVersionSchema,
    view: gameViewSchema,
    clocks: clocksSchema,
  }),
  z.strictObject({
    type: z.literal('EVENT'),
    stateVersion: stateVersionSchema,
    events: z.array(gameEventSchema),
  }),
  z.strictObject({
    type: z.literal('CHAT'),
    from: seatSchema,
    name: playerNameSchema,
    text: chatTextSchema,
    at: count,
  }),
  z.strictObject({
    type: z.literal('ERROR'),
    code: errorCodeSchema,
    message: z.string().max(200),
  }),
  z.strictObject({ type: z.literal('PONG'), t: z.number() }),
  z.strictObject({ type: z.literal('ROOM_LIST'), rooms: z.array(roomSummarySchema) }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageType = ServerMessage['type'];
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type Room = z.infer<typeof roomSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type Clocks = z.infer<typeof clocksSchema>;
