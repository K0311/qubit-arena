import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { SpaceBackground } from './components/space-background';
import { ConnectionBanner } from './components/connection-banner';
import { Toasts } from './components/ui/toast';
import { connection } from './net/connection';
import { useGame } from './state/store';
import { MainMenu } from './screens/main-menu';
import { ModeSelect } from './screens/mode-select';
import { Lobby } from './screens/lobby';
import { RoomScreen } from './screens/room';
import { GameScreen } from './screens/game/game-screen';
import { Placeholder } from './screens/placeholder';
import { SettingsScreen } from './screens/settings';
import { AboutScreen } from './screens/about';
import { applyDocumentSettings, useSettings } from './state/settings';
import { en } from './i18n/en';

/** Follow the server: a room we are in opens its screen, a started game opens the game. */
function RouteSync() {
  const code = useGame((s) => s.room?.code);
  const status = useGame((s) => s.room?.status);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!code || !status) return;
    const target = status === 'WAITING' ? `/room/${code}` : `/game/${code}`;
    if (pathname !== target) navigate(target);
    // Only when the room or its status changes, so the user can still browse menus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, status]);
  return null;
}

/** Routes from ui-spec §3. */
export function App() {
  useEffect(() => {
    connection();
  }, []);
  const motion = useSettings((s) => s.reduceMotion);
  const tips = useSettings((s) => s.tips);
  const speed = useSettings((s) => s.speed);
  useEffect(
    () => applyDocumentSettings({ reduceMotion: motion, tips, speed }),
    [motion, tips, speed],
  );
  return (
    <div className="app">
      <SpaceBackground />
      <ConnectionBanner />
      <RouteSync />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/play" element={<ModeSelect />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/room/:code" element={<RoomScreen />} />
        <Route path="/game/:id" element={<GameScreen />} />
        <Route path="/tutorial" element={<Placeholder title={en.menu.tutorial} />} />
        <Route path="/tutorial/:lesson" element={<Placeholder title={en.menu.tutorial} />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/about" element={<AboutScreen />} />
        <Route path="/study/*" element={<Placeholder title="Study" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </div>
  );
}
