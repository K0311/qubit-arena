import { useLocation, useNavigate } from 'react-router';
import { en } from '../i18n/en';
import { send } from '../net/connection';
import { useGame } from '../state/store';
import { Button } from './ui/button';

/** Where the player's room lives: the waiting room before the game, the game after it starts. */
export const roomPath = (code: string, status: string) =>
  status === 'WAITING' ? `/room/${code}` : `/game/${code}`;

/**
 * The browser's Back button or a menu link leaves the room screen but not the room: the server
 * still holds the seat. Without this bar the player sits in a room they cannot see (ui-spec §3).
 */
export function InRoomBar() {
  const room = useGame((s) => s.room);
  const leftRoom = useGame((s) => s.leftRoom);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!room) return null;
  const path = roomPath(room.code, room.status);
  if (pathname === path) return null;
  const playing = room.status !== 'WAITING';
  return (
    <div className="in-room-bar" role="status" data-testid="in-room-bar">
      <span>{en.inRoom.label(room.code)}</span>
      <Button size="small" data-testid="in-room-back" onClick={() => navigate(path)}>
        {playing ? en.lobby.backToGame : en.lobby.backToRoom}
      </Button>
      <Button
        size="small"
        variant="secondary"
        data-testid="in-room-leave"
        onClick={() => {
          send({ type: 'LEAVE' });
          leftRoom();
        }}
      >
        {en.inRoom.leave}
      </Button>
    </div>
  );
}
