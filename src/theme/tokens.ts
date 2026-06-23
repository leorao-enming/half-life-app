// =============================================================================
// src/theme/tokens.ts — Single source of truth for the Half-Life design system.
//
// Before this file, every screen redefined its own `C = {...}` palette with
// drifting hexes (#00B4FF vs #0FF0FC, #00FF87 vs #39FF14, #FFD600 vs #FFFF33).
// All screens now import from here so the look stays consistent.
//
// Accent colors are SEMANTIC — used for meaning, not decoration. A screen
// should use at most two accents beyond the neutrals.
// =============================================================================

import { Platform } from 'react-native';

export const color = {
  // ── Neutrals ───────────────────────────────────────────────────────────
  bg:        '#000000',
  surface:   '#0C0C0C',
  surfaceHi: '#141414',
  border:    '#1C1C1C',
  text:      '#FFFFFF',
  textMid:   '#6A6A6A',
  textDim:   '#2E2E2E',

  // ── Semantic accents ───────────────────────────────────────────────────
  primary: '#0FF0FC', // caffeine / focus — the hero accent
  ready:   '#39FF14', // sleep-ready / good state
  energy:  '#FFB020', // sugar / energy window (softer & more legible than #FFFF33)
  alert:   '#FF073A', // crash risk / over-limit
  sodium:  '#4A9EFF', // electrolytes — calm steel-blue, distinct from caffeine cyan
} as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

/** Type scale (px). */
export const type = {
  display: 30,
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

/** letterSpacing presets. Body text uses `tight`; labels use `label`/`wide`. */
export const tracking = {
  tight: 0.5,
  label: 3,
  wide:  4,
} as const;

/**
 * Compose a hex color with an alpha suffix (e.g. alpha(color.primary, 0.2)).
 * Accepts 0–1. Returns the hex with an 8-bit alpha channel appended.
 */
export function alpha(hex: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a));
  const byte = Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase();
  return `${hex}${byte}`;
}
