import { randomBytes, randomInt } from 'node:crypto';

/** Session token sent in WELCOME; 32 url-safe characters. */
export const newToken = (): string => randomBytes(24).toString('base64url');

/** Seed for one match's engine Rng (architecture.md §6). Never leaves the server. */
export const newSeed = (): number => randomBytes(4).readUInt32LE(0);

// No 0/O or 1/I so codes are easy to read out loud.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Room join code like "QX7-42" (ui-spec §5). */
export function newRoomCode(taken: (code: string) => boolean): string {
  for (;;) {
    let head = '';
    for (let i = 0; i < 3; i++) head += LETTERS[randomInt(LETTERS.length)];
    const code = `${head}-${String(randomInt(100)).padStart(2, '0')}`;
    if (!taken(code)) return code;
  }
}
