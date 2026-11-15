import { create } from 'zustand';
import type { Room, RoomSummary, ServerMessage } from '@qa/protocol';

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
export type GameViewData = Of<'GAME_VIEW'>['view'];
export type ClocksData = Of<'GAME_VIEW'>['clocks'];
export type GameEventData = Of<'EVENT'>['events'][number];
export type ChatLine = Of<'CHAT'>;
export type You = Of<'ROOM_STATE'>['you'];
export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
export type Toast = { id: number; text: string; tone: 'error' | 'info' };

const MAX_EVENTS = 300;
const MAX_CHAT = 100;

type GameState = {
  status: ConnectionStatus;
  token: string | null;
  room: Room | null;
  you: You | null;
  view: GameViewData | null;
  /** Clock readings of the latest GAME_VIEW and when they arrived (performance.now()). */
  clocks: ClocksData | null;
  clocksAt: number;
  events: GameEventData[];
  chat: ChatLine[];
  roomList: RoomSummary[] | null;
  /** Highest stateVersion seen in this room; older messages are ignored (architecture.md §5). */
  stateVersion: number;
  toasts: Toast[];
  setStatus: (status: ConnectionStatus) => void;
  receive: (msg: ServerMessage) => void;
  /** We sent LEAVE: the server stops sending this room, so forget it here. */
  leftRoom: () => void;
  pushToast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
};

const emptyRoom = {
  room: null,
  you: null,
  view: null,
  clocks: null,
  clocksAt: 0,
  events: [],
  chat: [],
  stateVersion: -1,
} satisfies Partial<GameState>;

let nextToastId = 1;

/**
 * Fed only by server messages. It never holds the deck, the seed or an opponent's cards,
 * because the server never sends them (rules.md §9).
 */
export const useGame = create<GameState>()((set, get) => ({
  status: 'idle',
  token: null,
  roomList: null,
  toasts: [],
  ...emptyRoom,

  setStatus: (status) => set({ status }),

  receive: (msg) => {
    const s = get();
    switch (msg.type) {
      case 'WELCOME':
        // A new token means a new server session: whatever room we had is gone.
        if (s.token && s.token !== msg.token) set({ ...emptyRoom });
        set({ token: msg.token });
        return;
      case 'ROOM_STATE': {
        const sameRoom = s.room?.code === msg.room.code;
        if (sameRoom && msg.stateVersion < s.stateVersion) return;
        set({
          ...(sameRoom ? {} : emptyRoom),
          room: msg.room,
          you: msg.you,
          stateVersion: msg.stateVersion,
        });
        return;
      }
      case 'GAME_VIEW':
        if (msg.stateVersion < s.stateVersion) return;
        set({
          view: msg.view,
          clocks: msg.clocks,
          clocksAt: performance.now(),
          stateVersion: msg.stateVersion,
        });
        return;
      case 'EVENT':
        if (msg.stateVersion < s.stateVersion) return;
        set({
          events: [...s.events, ...msg.events].slice(-MAX_EVENTS),
          stateVersion: msg.stateVersion,
        });
        return;
      case 'CHAT':
        set({ chat: [...s.chat, msg].slice(-MAX_CHAT) });
        return;
      case 'ROOM_LIST':
        set({ roomList: msg.rooms });
        return;
      case 'ERROR':
        get().pushToast(msg.message, 'error');
        return;
      case 'PONG':
        return;
    }
  },

  leftRoom: () => set({ ...emptyRoom }),

  pushToast: (text, tone = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, text, tone }].slice(-4) })),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
