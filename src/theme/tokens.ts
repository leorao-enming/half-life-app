// =============================================================================
// src/theme/tokens.ts — Half-Life design system
//
// Luxury tier palette: warm near-blacks, muted semantic accents, warm ivory
// text. Accents are used for MEANING (one glowing focal element), not
// decoration. Every screen imports from here — no per-file color drift.
// =============================================================================

import { Platform } from 'react-native';

export const color = {
  // ── Neutrals — warm, not pure digital black/white ─────────────────────
  bg:        '#070706',   // velvet near-black with a barely-there warm tint
  surface:   '#0E0D0B',   // deep charcoal
  surfaceHi: '#151412',   // elevated card surface
  border:    '#1D1C19',   // barely-there divider
  text:      '#DEDAD3',   // warm ivory (not harsh white)
  textMid:   '#9A958D',   // readable warm grey for supporting information
  textDim:   '#706B64',   // subdued, but still visible on the dark surface

  // ── Semantic accents — muted, sophisticated ────────────────────────────
  // Think: instrument luminescence, not neon signage.
  primary: '#5DC4BC',   // soft aquamarine  — caffeine / focus
  ready:   '#6AB87A',   // muted sage green — sleep-ready / clear
  energy:  '#BF9040',   // warm amber gold  — sugar / energy
  alert:   '#B04848',   // muted burgundy   — crash / over-limit
  sodium:  '#5888A8',   // soft steel blue  — electrolytes
  routeTarget: '#9B8BD0', // muted violet — target sleep landing
} as const;

export const font = {
  mono:    Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  // system = '' (omit fontFamily) → SF Pro Display on iOS; Roboto on Android
  // Used for display numbers — system thin weights look like watch dial indices.
  display: undefined as undefined,
} as const;

/** Type scale (px). */
export const type = {
  display: 52,
  h1:      22,
  h2:      15,
  body:    12,
  label:   9,
  micro:   7,
} as const;

/** Spacing scale (px). */
export const space = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const;

/** letterSpacing presets. Body uses `tight`; labels use `label`. */
export const tracking = {
  tight: 0.2,
  label: 2,
  wide:  3.5,
} as const;

/**
 * Append an 8-bit alpha to a hex color string.
 * alpha(color.primary, 0.2) → '#5DC4BC33'
 */
export function alpha(hex: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a));
  const byte    = Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase();
  return `${hex}${byte}`;
}
