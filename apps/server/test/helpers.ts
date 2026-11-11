import { WebSocket } from 'ws';
import type { Mode, PlayerId } from '@qa/engine';
import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@qa/protocol';
import { startServer, type RunningServer, type ServerOptions } from '../src/server';

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** A scripted client over a real socket. Every server message must pass the protocol schema. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  closed = false;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const res = parseServerMessage(data.toString());
      if (!res.ok) throw new Error(`server sent an invalid message: ${res.error}`);
      this.messages.push(res.msg);
      this.wake();
    });
    ws.on('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  static async connect(port: number, token?: string): Promise<TestClient> {
    const url = `ws://127.0.0.1:${port}/${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(url);
    const client = new TestClient(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await client.waitFor('WELCOME');
    return client;
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  send(msg: ClientMessage): void {
    this.ws.send(encodeMessage(msg));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** First message of this type (after index `from`) that matches. */
  async waitFor<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Of<T>) => boolean = () => true,
    from = 0,
    timeoutMs = 2000,
  ): Promise<Of<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.messages
        .slice(from)
        .find((m): m is Of<T> => m.type === type && pred(m as Of<T>));
      if (hit) return hit;
      const left = deadline - Date.now();
      if (left <= 0 || this.closed) {
        throw new Error(`timed out waiting for ${type}; got ${this.messages.map((m) => m.type)}`);
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** Send, then wait for the reply of `type` that arrives after it. */
  async request<T extends ServerMessage['type']>(
    msg: ClientMessage,
    type: T,
    pred?: (m: Of<T>) => boolean,
  ): Promise<Of<T>> {
    const mark = this.messages.length;
    this.send(msg);
    return this.waitFor(type, pred, mark);
  }

  latest<T extends ServerMessage['type']>(type: T): Of<T> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m?.type === type) return m as Of<T>;
    }
    return undefined;
  }

  get token(): string {
    const w = this.messages.find((m) => m.type === 'WELCOME');
    if (w?.type !== 'WELCOME') throw new Error('no WELCOME');
    return w.token;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    const done = new Promise<void>((resolve) => this.ws.once('close', () => resolve()));
    this.ws.close();
    await done;
  }
}

export async function withServer(options: ServerOptions = {}): Promise<RunningServer> {
  return startServer({ port: 0, host: '127.0.0.1', ...options });
}

export type Table = {
  host: TestClient;
  clients: Record<PlayerId, TestClient>;
  code: string;
};

/** Create a room, fill every seat, ready up and start (T-S-01 steps). */
export async function startTable(
  port: number,
  mode: Mode,
  settings?: Extract<ClientMessage, { type: 'CREATE_ROOM' }>['settings'],
): Promise<Table> {
  const host = await TestClient.connect(port);
  const created = await host.request(
    {
      type: 'CREATE_ROOM',
      mode,
      visibility: 'PRIVATE',
      name: 'Test room',
      playerName: 'P1',
      ...(settings ? { settings } : {}),
    },
    'ROOM_STATE',
  );
  const code = created.room.code;
  const clients = { P1: host } as Record<PlayerId, TestClient>;
  const seats: PlayerId[] = mode === 'SOLO' ? ['P2'] : ['P2', 'P3', 'P4'];
  for (const seat of seats) {
    const c = await TestClient.connect(port);
    const joined = await c.request(
      { type: 'JOIN_ROOM', code, role: 'PLAYER', playerName: seat },
      'ROOM_STATE',
    );
    if (joined.you.seat !== seat) throw new Error(`expected ${seat}, got ${joined.you.seat}`);
    clients[seat] = c;
  }
  for (const c of Object.values(clients)) {
    await c.request({ type: 'READY', ready: true }, 'ROOM_STATE');
  }
  await host.request({ type: 'START_GAME' }, 'GAME_VIEW');
  return { host, clients, code };
}

export async function closeAll(clients: Iterable<TestClient>): Promise<void> {
  await Promise.all([...clients].map((c) => c.close()));
}
