import type { CardKind } from '@qa/engine';

/** Design tokens from ui-spec §2. The same values are CSS variables in global.css. */
export const colors = {
  bgDeep: '#060A22',
  bgBase: '#0B1236',
  surfacePanel: '#101A4A',
  surfaceRaised: '#16225C',
  strokeSubtle: '#2A3A86',
  accentCyan: '#27E5F7',
  accentGold: '#FFD14D',
  accentPurple: '#A26BFF',
  accentGreen: '#3DDC97',
  teamBlue: '#1F5BD6',
  teamBlueSoft: '#7FB2FF',
  teamRed: '#C8323F',
  teamRedSoft: '#FF9AA3',
  textPrimary: '#F5F5FA',
  textMuted: '#9AA6D6',
} as const;

/** ui-spec §2.2: never a team colour, never two gates the same. */
export const gateColors: Readonly<Record<CardKind, string>> = {
  H: '#8B5CF6',
  X: '#F43F5E',
  Y: '#A855F7',
  Z: '#10B981',
  S: '#2DD4BF',
  SX: '#F59E0B',
  I: '#94A3B8',
  MEASURE: '#60A5FA',
  CNOT: '#EC4899',
};

export const fonts = {
  display: "'Orbitron', system-ui, sans-serif",
  body: "'Exo 2', system-ui, sans-serif",
  ket: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const space = [4, 8, 12, 16, 24, 32] as const;

/** Glow is reserved for the active player, selected card, primary buttons, main panel. */
export const glow = (hex: string): string => `0 0 24px ${hex}80`;
