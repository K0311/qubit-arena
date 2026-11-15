import type { Position } from '@qa/engine';

/** The six state colours from visual-design §2 (dome characters and board kets). */
export const stateColors: Readonly<Record<Position, string>> = {
  ZERO: '#F79933',
  PLUS: '#ED298C',
  MINUS_I: '#9E40F5',
  ONE: '#4080EB',
  MINUS: '#ED4A26',
  PLUS_I: '#40E699',
};
