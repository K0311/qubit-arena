import { encodeMessage, parseServerMessage, type ClientMessage } from '@qa/protocol';
import { useGame } from '../state/store';

const TOKEN_KEY = 'qa.token';
const MAX_BACKOFF_MS = 8000;

// Per tab, so two tabs are two players when testing (sessionStorage is not shared).
const storage = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private mode: reconnection after a reload will not keep the seat, play still works.
    }
  },
};

/**
 * One WebSocket to the game server. Reconnects with backoff and sends the WELCOME token back
 * so the server returns the same seat (rules.md §10). Only intents go out (architecture.md §5).
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private retry = 0;
  private queue: ClientMessage[] = [];
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly url: string) {}

  start(): void {
    if (this.ws || this.stopped) return;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeMessage(msg));
    else this.queue.push(msg);
  }

  private open(): void {
    const token = storage.get();
    const url = token ? `${this.url}?token=${encodeURIComponent(token)}` : this.url;
    const store = useGame.getState();
    store.setStatus(this.retry === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      useGame.getState().setStatus('open');
      const pending = this.queue;
      this.queue = [];
      for (const msg of pending) ws.send(encodeMessage(msg));
    };
    ws.onmessage = (ev) => {
      const res = parseServerMessage(typeof ev.data === 'string' ? ev.data : '');
      if (!res.ok) {
        console.warn('[net] ignored invalid server message:', res.error);
        return;
      }
      if (res.msg.type === 'WELCOME') storage.set(res.msg.token);
      useGame.getState().receive(res.msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      useGame.getState().setStatus('reconnecting');
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }
}

function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8080`;
}

let shared: GameConnection | null = null;

/** The app's single connection, opened on first use. */
export function connection(): GameConnection {
  if (!shared) {
    shared = new GameConnection(serverUrl());
    shared.start();
  }
  return shared;
}

export const send = (msg: ClientMessage): void => connection().send(msg);
