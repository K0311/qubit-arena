import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_CLIENT_MESSAGE_LENGTH } from '@qa/protocol';
import { GameServer, type GameServerOptions } from './game-server';
import type { Connection } from './room';

export type ServerOptions = GameServerOptions & {
  /** 0 picks a free port (tests). */
  port?: number;
  host?: string;
  /** Ping every client this often; one that misses a pong is dropped. */
  heartbeatMs?: number;
};

export type RunningServer = {
  readonly port: number;
  readonly game: GameServer;
  close(): Promise<void>;
};

/** Connection layer (architecture.md §6): WebSocket transport, session token, heartbeat. */
export function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const game = new GameServer(options);
  const wss = new WebSocketServer({
    port: options.port ?? 0,
    ...(options.host ? { host: options.host } : {}),
    // Room for the JSON plus multi-byte characters; parseClientMessage enforces the real cap.
    maxPayload: MAX_CLIENT_MESSAGE_LENGTH * 4,
  });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws, req) => {
    const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token');
    const conn: Connection = {
      send: (text) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(text);
      },
      close: () => ws.close(),
    };
    const session = game.connect(conn, token ?? undefined);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data, isBinary) => {
      game.receive(session, isBinary ? '' : data.toString());
    });
    ws.on('close', () => game.disconnect(session, conn));
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      resolve({
        port: (wss.address() as AddressInfo).port,
        game,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
