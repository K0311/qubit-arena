import { z } from 'zod';

// Building blocks shared by client and server messages. Value lists mirror @qa/engine;
// test/types.test.ts fails to compile if they ever drift apart.

export const modeSchema = z.enum(['SOLO', 'TEAM']);
export const sideSchema = z.enum(['BLUE', 'RED']);
export const seatSchema = z.enum(['P1', 'P2', 'P3', 'P4']);
export const cardKindSchema = z.enum(['H', 'X', 'Y', 'Z', 'S', 'SX', 'I', 'MEASURE', 'CNOT']);
export const positionSchema = z.enum(['ZERO', 'PLUS', 'MINUS_I', 'ONE', 'MINUS', 'PLUS_I']);
export const ballPositionSchema = z.enum([...positionSchema.options, 'FOG']);
export const kickoffPositionSchema = z.enum(['ZERO', 'ONE']);
export const phaseSchema = z.enum(['LOBBY', 'KICKOFF', 'PLAYING', 'CHALLENGE', 'FINISHED']);
export const endReasonSchema = z.enum(['TARGET', 'TIME', 'NO_CARDS', 'CHALLENGE', 'DRAW']);
export const winnerSchema = z.enum(['BLUE', 'RED', 'DRAW']);
export const visibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

export const count = z.number().int().nonnegative();
/** Monotonic per room; clients drop messages older than what they already have. */
export const stateVersionSchema = count;

export const playerNameSchema = z.string().trim().min(1).max(24);
export const roomNameSchema = z.string().trim().min(1).max(40);
/** Join code such as `QX7-42` (ui-spec §5). */
export const roomCodeSchema = z.string().regex(/^[A-Z0-9]{2,6}(-[A-Z0-9]{2,6})?$/);
export const chatTextSchema = z.string().trim().min(1).max(200);

export const sideRecord = <T extends z.ZodType>(value: T) => z.record(sideSchema, value);
