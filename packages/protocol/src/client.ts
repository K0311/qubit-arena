import { z } from 'zod';
import {
  cardKindSchema,
  chatTextSchema,
  modeSchema,
  playerNameSchema,
  roomCodeSchema,
  roomNameSchema,
  seatSchema,
  visibilitySchema,
} from './shared';

/** Hand size is fixed by rules.md §5, so a deck must hold at least seats × 4 cards. */
const HAND_SIZE = 4;
const SEATS = { SOLO: 2, TEAM: 4 } as const;

const minutes = (m: number) => m * 60 * 1000;
const seconds = (s: number) => s * 1000;

/**
 * Room settings the host may change (rules.md §3.5, §5, §8.1). Omitted fields use the
 * engine defaults. The bounds are not in rules.md; they only keep rooms sane.
 */
export const roomSettingsSchema = z.strictObject({
  targetScore: z.number().int().min(1).max(21).optional(),
  timeLimitMs: z.number().int().min(minutes(1)).max(minutes(60)).optional(),
  turnTimerMs: z.number().int().min(seconds(10)).max(seconds(300)).optional(),
  suddenDeath: z.boolean().optional(),
  deckCounts: z.record(cardKindSchema, z.number().int().min(0).max(20)).optional(),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

// Every client message is an intent plus ids. No player, seat-of-sender, score or seed:
// the server knows who is on each connection (architecture.md §5). Strict objects reject
// anything extra.
const createRoom = z
  .strictObject({
    type: z.literal('CREATE_ROOM'),
    mode: modeSchema,
    visibility: visibilitySchema,
    name: roomNameSchema,
    playerName: playerNameSchema,
    settings: roomSettingsSchema.optional(),
  })
  .superRefine((msg, ctx) => {
    const counts = msg.settings?.deckCounts;
    if (!counts) return;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const needed = SEATS[msg.mode] * HAND_SIZE;
    if (total < needed) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'deckCounts'],
        message: `deck has ${total} cards; ${msg.mode} needs at least ${needed} to deal`,
      });
    }
  });

export const clientMessageSchema = z.discriminatedUnion('type', [
  createRoom,
  z.strictObject({
    type: z.literal('JOIN_ROOM'),
    code: roomCodeSchema,
    role: z.enum(['PLAYER', 'SPECTATOR']),
    playerName: playerNameSchema,
  }),
  z.strictObject({
    type: z.literal('QUICK_MATCH'),
    mode: modeSchema,
    playerName: playerNameSchema,
  }),
  z.strictObject({ type: z.literal('TAKE_SEAT'), seat: seatSchema }),
  /** ui-spec §6 ready pill; not in the original §5 list. */
  z.strictObject({ type: z.literal('READY'), ready: z.boolean() }),
  z.strictObject({ type: z.literal('START_GAME') }),
  z.strictObject({ type: z.literal('PLAY_CARD'), cardId: z.number().int().positive() }),
  z.strictObject({ type: z.literal('CHAT'), text: chatTextSchema }),
  z.strictObject({
    type: z.literal('CHALLENGE_ANSWER'),
    questionId: z.string().min(1).max(64),
    // 2–6 choices per question (ui-spec §9).
    choice: z.number().int().min(0).max(5),
  }),
  z.strictObject({ type: z.literal('LEAVE') }),
  z.strictObject({ type: z.literal('PING'), t: z.number() }),
  /** Lobby room list (ui-spec §5); the server answers with ROOM_LIST of public rooms. */
  z.strictObject({ type: z.literal('LIST_ROOMS'), mode: modeSchema.optional() }),
  /**
   * Host edits the match settings before the game (ui-spec §6). The mode cannot change: it
   * fixes the seats. The server checks the deck against the room's mode.
   */
  z.strictObject({ type: z.literal('UPDATE_SETTINGS'), settings: roomSettingsSchema }),
  /**
   * Play Again (ui-spec §10): a seated player sends the finished room back to WAITING with the
   * same seats; everyone presses Ready again, which is the rematch vote.
   */
  z.strictObject({ type: z.literal('REMATCH') }),
  /**
   * Bot Arena: the host puts a bot (rules.md §10 bot) in a free seat before the game, the given
   * one or the first free one. The bot is always ready and never takes a human's seat.
   */
  z.strictObject({ type: z.literal('ADD_BOT'), seat: seatSchema.optional() }),
  z.strictObject({ type: z.literal('REMOVE_BOT'), seat: seatSchema }),
  /** Bot Arena shortcut: a private room with you in P1, bots everywhere else, started at once. */
  z.strictObject({ type: z.literal('BOT_GAME'), mode: modeSchema, playerName: playerNameSchema }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
