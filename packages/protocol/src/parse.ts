import type { z } from 'zod';
import { clientMessageSchema, type ClientMessage } from './client';
import { serverMessageSchema, type ServerMessage } from './server';

/** Client messages are tiny intents; anything bigger is a bug or abuse. */
export const MAX_CLIENT_MESSAGE_LENGTH = 4096;

export type ParseResult<T> =
  { readonly ok: true; readonly msg: T } | { readonly ok: false; readonly error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: unknown, maxLength?: number): ParseResult<T> {
  let data = raw;
  if (typeof raw === 'string') {
    if (maxLength !== undefined && raw.length > maxLength) {
      return { ok: false, error: `message longer than ${maxLength} characters` };
    }
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'message is not valid JSON' };
    }
  }
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, msg: res.data };
  const issue = res.error.issues[0];
  const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
  return { ok: false, error: `${issue?.message ?? 'invalid message'}${where}` };
}

/** Validate anything a client sends (raw socket text or an object). Never throws. */
export const parseClientMessage = (raw: unknown): ParseResult<ClientMessage> =>
  parseWith(clientMessageSchema, raw, MAX_CLIENT_MESSAGE_LENGTH);

/** Validate anything the server sends; clients run this on every message. Never throws. */
export const parseServerMessage = (raw: unknown): ParseResult<ServerMessage> =>
  parseWith(serverMessageSchema, raw);

export const encodeMessage = (msg: ClientMessage | ServerMessage): string => JSON.stringify(msg);
