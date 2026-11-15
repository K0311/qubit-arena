import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@qa/protocol';
import type { GameServer } from '../src/game-server';
import type { Connection, Session } from '../src/room';

/** Scripted clients move far faster than people, so tests can lift the flood limit. */
export const NO_LIMITS = {
  messages: { capacity: 1e6, perSecond: 1e6 },
  chat: { capacity: 1e6, perSecond: 1e6 },
};

/** In-memory client: the GameServer is transport-free, so whole games run synchronously. */
export class MemClient implements Connection {
  readonly msgs: ServerMessage[] = [];
  session: Session;
  /** With a token from an earlier WELCOME this is a reconnect (rules.md §10). */
  constructor(
    private readonly server: GameServer,
    token?: string,
  ) {
    this.session = server.connect(this, token);
  }
  send(text: string): void {
    const res = parseServerMessage(text);
    if (!res.ok) throw new Error(`invalid server message: ${res.error}`);
    this.msgs.push(res.msg);
  }
  close(): void {}
  say(msg: ClientMessage): void {
    this.server.receive(this.session, encodeMessage(msg));
  }
  /** The socket drops (no LEAVE). */
  drop(): void {
    this.server.disconnect(this.session, this);
  }
  latest<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m?.type === type) return m as Extract<ServerMessage, { type: T }>;
    }
    throw new Error(`no ${type}`);
  }
}
