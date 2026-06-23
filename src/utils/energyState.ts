// =============================================================================
// src/utils/energyState.ts — Caffeine-driven energy/state computations.
//
// Centralizes logic that was previously inline in app/(tabs)/index.tsx and
// duplicated in components/OptimalWindows.tsx. Pure functions only — callers
// pass an explicit `nowMs` so nothing here ever calls Date.now() inside a
// Zustand selector (which would cause infinite re-render loops).
// =============================================================================

import { HALF_LIVES } from './kinetics';
import { color } from '../theme/tokens';

/** Caffeine is considered "cleared" below this active amount (mg). */
export const CAFFEINE_CLEAR_MG = 5;

/**
 * Effective caffeine half-life (hours) after personal metabolism + HealthKit
 * resting-heart-rate adjustment. This formula previously appeared in three
 * separate files — this is now the single source.
 *
 *   faster metabolizer (cafFactor > 1)  → shorter half-life
 *   elevated RHR (healthKitMult < 1)    → longer half-life
 */
export function effectiveCaffeineHalfLife(cafFactor: number, healthKitMult: number): number {
  const safeFactor = cafFactor > 0 ? cafFactor : 1;
  const safeMult   = healthKitMult > 0 ? healthKitMult : 1;
  return (HALF_LIVES.CAFFEINE / safeFactor) * (1 / safeMult);
}

/**
 * Seconds until active caffeine decays below CAFFEINE_CLEAR_MG.
 * Returns 0 if already cleared.
 */
export function clearanceSecs(activeCaffeineMg: number, halfLifeHours: number): number {
  if (activeCaffeineMg <= CAFFEINE_CLEAR_MG || halfLifeHours <= 0) return 0;
  return Math.round(halfLifeHours * Math.log2(activeCaffeineMg / CAFFEINE_CLEAR_MG) * 3_600);
}

/**
 * Wall-clock timestamp (ms) when caffeine is projected to clear, or null if
 * already cleared / nothing active. Drives the "Sleep-ready at HH:MM" line.
 */
export function sleepReadyAt(
  activeCaffeineMg: number,
  halfLifeHours: number,
  nowMs: number,
): number | null {
  const secs = clearanceSecs(activeCaffeineMg, halfLifeHours);
  if (secs <= 0) return null;
  return nowMs + secs * 1_000;
}

export type EnergyStateKey = 'PEAK' | 'STEADY' | 'WINDING_DOWN' | 'CLEAR';

export interface EnergyState {
  key:   EnergyStateKey;
  label: string;
  color: string;
}

/**
 * Maps active caffeine (mg) to an energy/focus state. Replaces the old
 * resolveStatus() with energy-framed language instead of reactor terminology
 * (OVERCHARGED/OPTIMAL/DECLINING/STANDBY).
 */
export function classifyEnergyState(activeCaffeineMg: number): EnergyState {
  if (activeCaffeineMg > 200) return { key: 'PEAK',         label: 'PEAK FOCUS',   color: color.energy  };
  if (activeCaffeineMg > 100) return { key: 'STEADY',       label: 'STEADY',       color: color.primary };
  if (activeCaffeineMg > CAFFEINE_CLEAR_MG)
    return                           { key: 'WINDING_DOWN', label: 'WINDING DOWN', color: color.sodium  };
  return                             { key: 'CLEAR',        label: 'CLEAR',        color: color.ready   };
}

/** Format a wall-clock ms timestamp as "HH:MM" (24h, zero-padded). */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Format a countdown of seconds as "HH:MM:SS". */
export function fmtCountdown(totalSec: number): string {
  if (totalSec <= 0) return '00:00:00';
  const h   = Math.floor(totalSec / 3_600);
  const m   = Math.floor((totalSec % 3_600) / 60);
  const sec = totalSec % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}
