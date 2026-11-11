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
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];
