/**
 * Tiny terminal client so two people can play over the real server before the web client
 * exists (roadmap phase 3 done-when). Usage:
 *   pnpm --filter @qa/server cli [ws://localhost:8080] [--name Ann] [--token <token>]
 */
import { createInterface } from 'node:readline';
import { WebSocket } from 'ws';
import type { PlayerId } from '@qa/engine';
import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@qa/protocol';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = args.find((a) => a.startsWith('ws')) ?? 'ws://localhost:8080';
const name = flag('name') ?? `Player${Math.floor(Math.random() * 100)}`;
const token = flag('token');

const KET: Record<string, string> = {
  ZERO: '|0⟩',
  ONE: '|1⟩',
  PLUS: '|+⟩',
  MINUS: '|−⟩',
  PLUS_I: '|i⟩',
  MINUS_I: '|−i⟩',
  FOG: 'fog',
};

let view: Extract<ServerMessage, { type: 'GAME_VIEW' }>['view'] | undefined;
const ws = new WebSocket(token ? `${url}/?token=${token}` : url);
const send = (msg: ClientMessage) => ws.send(encodeMessage(msg));

function show(msg: ServerMessage): void {
  switch (msg.type) {
    case 'WELCOME':
      console.log(`connected; reconnect with --token ${msg.token}`);
      break;
    case 'ROOM_STATE': {
      const seats = Object.entries(msg.room.seats)
        .map(
          ([p, s]) =>
            `${p}:${s ? `${s.name}${s.ready ? '✓' : ''}${s.bot ? '(bot)' : ''}${s.connected ? '' : '(away)'}` : '-'}`,
        )
        .join('  ');
      console.log(
        `room ${msg.room.code} [${msg.room.mode} ${msg.room.status}] you=${msg.you.seat ?? '-'}  ${seats}`,
      );
      break;
    }
    case 'GAME_VIEW': {
      view = msg.view;
      const me = view.viewer === 'SPECTATOR' ? undefined : (view.viewer as PlayerId);
      const hand = me ? (view.hands[me] ?? []) : [];
      console.log(
        `ball ${KET[view.ball]}  partner ${KET[view.partner]}  score B${view.score.BLUE}-R${view.score.RED}  turn ${view.turn}  phase ${view.phase}` +
          (view.timeUp ? '  (time up)' : ''),
      );
      if (me) console.log(`your hand: ${hand.map((c, i) => `${i + 1}:${c.kind}`).join('  ')}`);
      if (view.challenge) {
        const q = view.challenge.question;
        console.log(`QUESTION ${view.challenge.index + 1}: ${q.prompt}`);
        q.choices.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
      }
      if (view.winner) console.log(`GAME OVER: ${view.winner} (${view.endReason})`);
      break;
    }
    case 'EVENT':
      for (const e of msg.events) {
        if (e.type === 'CARD_PLAYED') {
          console.log(
            `> ${e.player} played ${e.card.kind}: ${KET[e.from]} → ${KET[e.to]}${e.byTimeout ? ' (timeout)' : ''}`,
          );
        } else console.log(`> ${JSON.stringify(e)}`);
      }
      break;
    case 'CHAT':
      console.log(`[team] ${msg.name}: ${msg.text}`);
      break;
    case 'ERROR':
      console.log(`! ${msg.code}: ${msg.message}`);
      break;
    case 'PONG':
      break;
  }
}

const HELP = `commands: create solo|team [private] · join CODE · watch CODE · quick solo|team ·
seat P1..P4 · ready · start · play N · answer N · say TEXT · leave · quit`;

function command(line: string): void {
  const [cmd = '', ...rest] = line.trim().split(/\s+/);
  const arg = rest[0] ?? '';
  const mode = arg.toUpperCase() === 'TEAM' ? 'TEAM' : 'SOLO';
  switch (cmd) {
    case 'create':
      return send({
        type: 'CREATE_ROOM',
        mode,
        visibility: rest[1] === 'private' ? 'PRIVATE' : 'PUBLIC',
        name: `${name}'s room`,
        playerName: name,
      });
    case 'join':
    case 'watch':
      return send({
        type: 'JOIN_ROOM',
        code: arg.toUpperCase(),
        role: cmd === 'join' ? 'PLAYER' : 'SPECTATOR',
        playerName: name,
      });
    case 'quick':
      return send({ type: 'QUICK_MATCH', mode, playerName: name });
    case 'seat':
      return send({ type: 'TAKE_SEAT', seat: arg.toUpperCase() as PlayerId });
    case 'ready':
      return send({ type: 'READY', ready: true });
    case 'start':
      return send({ type: 'START_GAME' });
    case 'play': {
      const me = view?.viewer as PlayerId | undefined;
      const card = me ? view?.hands[me]?.[Number(arg) - 1] : undefined;
      if (!card) return console.log('! no such card');
      return send({ type: 'PLAY_CARD', cardId: card.id });
    }
    case 'answer': {
      const q = view?.challenge?.question;
      if (!q) return console.log('! no question');
      return send({ type: 'CHALLENGE_ANSWER', questionId: q.id, choice: Number(arg) - 1 });
    }
    case 'say':
      return send({ type: 'CHAT', text: rest.join(' ') });
    case 'leave':
      return send({ type: 'LEAVE' });
    case 'quit':
      ws.close();
      process.exit(0);
      return;
    default:
      console.log(HELP);
  }
}

ws.on('message', (data) => {
  const res = parseServerMessage(data.toString());
  if (res.ok) show(res.msg);
  else console.log(`! bad server message: ${res.error}`);
});
ws.on('open', () => {
  console.log(HELP);
  createInterface({ input: process.stdin }).on('line', command);
});
ws.on('close', () => {
  console.log('disconnected');
  process.exit(0);
});
ws.on('error', (e) => console.log(`! ${e.message}`));
