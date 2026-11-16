import { create } from 'zustand';
import type { CameraView } from '../components/board3d/layout';

/** Personal settings (ui-spec §12, visual-design §7). None of them change the game state. */
export type Settings = {
  board: '2D' | '3D';
  /** 3D camera (visual-design §5). */
  camera: CameraView;
  reduceMotion: 'system' | 'on';
  /** Swirl brightness and opacity, 0–100 %. */
  swirl: number;
  showLabels: boolean;
  tips: boolean;
  /** Animation speed multiplier. */
  speed: 0.5 | 1 | 2;
  ball: 'football' | 'heart' | 'star';
};

export const DEFAULT_SETTINGS: Settings = {
  // ui-spec §12: 3D by default; the game falls back to 2D when WebGL is missing.
  board: '3D',
  camera: 'GOAL',
  reduceMotion: 'system',
  swirl: 100,
  showLabels: true,
  tips: true,
  speed: 1,
  ball: 'football',
};

const KEY = 'qa.settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Store = Settings & { set: (patch: Partial<Settings>) => void; reset: () => void };

export const useSettings = create<Store>()((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const s = get();
    const values: Settings = {
      board: s.board,
      camera: s.camera,
      reduceMotion: s.reduceMotion,
      swirl: s.swirl,
      showLabels: s.showLabels,
      tips: s.tips,
      speed: s.speed,
      ball: s.ball,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(values));
    } catch {
      // Private mode or blocked storage: settings still work for this visit.
    }
  },
  reset: () => get().set(DEFAULT_SETTINGS),
}));

/** Page-wide switches read by CSS (reduce motion, tooltips). */
export function applyDocumentSettings(s: Pick<Settings, 'reduceMotion' | 'tips' | 'speed'>) {
  const root = document.documentElement;
  root.dataset.motion = s.reduceMotion === 'on' ? 'reduce' : 'system';
  root.dataset.tips = s.tips ? 'on' : 'off';
  root.style.setProperty('--anim-speed', String(s.speed));
}
