import type { LogEntry } from '../store/useBioStore';
import {
  classifyEnergyState,
  effectiveCaffeineHalfLife,
  sleepReadyAt,
} from '../utils/energyState';
import { computeActiveCaffeine } from '../store/useBioStore';

export type DrinkKind = 'coffee' | 'tea' | 'energy' | 'cola';

export interface DrinkOption {
  id: DrinkKind;
  label: string;
  caption: string;
  defaultDose: number;
  accent: string;
}

export const DRINK_OPTIONS: readonly DrinkOption[] = [
  { id: 'coffee', label: 'Coffee', caption: 'latte, americano, cold brew', defaultDose: 95, accent: '#BF9040' },
  { id: 'tea', label: 'Tea', caption: 'black, green, matcha', defaultDose: 40, accent: '#5DC4BC' },
  { id: 'energy', label: 'Energy drink', caption: 'can or shot', defaultDose: 160, accent: '#A77AD9' },
  { id: 'cola', label: 'Cola', caption: 'regular cola', defaultDose: 35, accent: '#7C93C9' },
] as const;

export const DOSE_OPTIONS = [35, 63, 95, 120, 160, 200] as const;
export const USUAL_COFFEE_MG = 95;

export interface CaffeineSnapshot {
  activeMg: number;
  halfLifeHours: number;
  readyAtMs: number | null;
  state: ReturnType<typeof classifyEnergyState>;
}

export function caffeineSnapshot(
  logs: LogEntry[],
  caffeineFactor: number,
  healthKitMultiplier: number,
  nowMs: number,
): CaffeineSnapshot {
  const halfLifeHours = effectiveCaffeineHalfLife(caffeineFactor, healthKitMultiplier);
  const activeMg = computeActiveCaffeine(logs, caffeineFactor, healthKitMultiplier, nowMs);

  return {
    activeMg,
    halfLifeHours,
    readyAtMs: sleepReadyAt(activeMg, halfLifeHours, nowMs),
    state: classifyEnergyState(activeMg),
  };
}

export interface DrinkImpact extends CaffeineSnapshot {
  currentReadyAtMs: number | null;
  addedMinutes: number;
}

/** Calculates the visible forecast after adding a dose at `nowMs`. */
export function drinkImpact(
  logs: LogEntry[],
  doseMg: number,
  caffeineFactor: number,
  healthKitMultiplier: number,
  nowMs: number,
): DrinkImpact {
  const current = caffeineSnapshot(logs, caffeineFactor, healthKitMultiplier, nowMs);
  const activeMg = current.activeMg + Math.max(0, doseMg);
  const readyAtMs = sleepReadyAt(activeMg, current.halfLifeHours, nowMs);

  return {
    activeMg,
    halfLifeHours: current.halfLifeHours,
    currentReadyAtMs: current.readyAtMs,
    readyAtMs,
    state: classifyEnergyState(activeMg),
    addedMinutes: Math.max(0, Math.round(((readyAtMs ?? nowMs) - (current.readyAtMs ?? nowMs)) / 60_000)),
  };
}

export function formatImpact(impact: DrinkImpact): string {
  if (!impact.currentReadyAtMs && impact.readyAtMs) return 'starts a new low-impact estimate';
  if (impact.addedMinutes <= 0) return 'does not move your current estimate';
  if (impact.addedMinutes < 60) return `moves it about ${impact.addedMinutes} min later`;

  const hours = Math.floor(impact.addedMinutes / 60);
  const minutes = impact.addedMinutes % 60;
  return `moves it about ${hours}h${minutes ? ` ${minutes}m` : ''} later`;
}

export interface CurfewPlan {
  cutoffMinutes: number;
  cutoffLabel: string;
  rationale: string;
}

/**
 * A conservative, explainable planning heuristic: leave roughly three
 * effective half-lives before wake-up, adjusted for a late-work deadline.
 */
export function buildCurfewPlan(
  wakeTime: string,
  hasLateDeadline: boolean,
  halfLifeHours: number,
): CurfewPlan {
  const [hours = 7, minutes = 30] = wakeTime.split(':').map(Number);
  const wakeMinutes = hours * 60 + minutes;
  const bufferHours = Math.max(12, Math.round(halfLifeHours * 3));
  const deadlineAdjustment = hasLateDeadline ? 60 : 0;
  const cutoffMinutes = (wakeMinutes - bufferHours * 60 + deadlineAdjustment + 1_440) % 1_440;
  const cutoffLabel = `${String(Math.floor(cutoffMinutes / 60)).padStart(2, '0')}:${String(cutoffMinutes % 60).padStart(2, '0')}`;

  return {
    cutoffMinutes,
    cutoffLabel,
    rationale: hasLateDeadline
      ? 'Your late deadline shifts the estimate one hour later. Prefer smaller or lower-caffeine options after this time.'
      : 'This leaves about three estimated half-lives before tomorrow’s wake-up. Your recorded history will refine it over time.',
  };
}

/**
 * Derives a gentle, non-medical target sleep time from tomorrow's configured
 * wake-up. The target is intentionally shown as a planning reference only.
 */
export function targetSleepAt(wakeTime: string, nowMs: number): number {
  const [hours = 7, minutes = 30] = wakeTime.split(':').map(Number);
  const wake = new Date(nowMs);
  wake.setHours(hours, minutes, 0, 0);
  if (wake.getTime() <= nowMs) wake.setDate(wake.getDate() + 1);
  const target = wake.getTime() - 8 * 3_600_000;
  return target > nowMs ? target : target + 24 * 3_600_000;
}

/**
 * Isolates one drink's estimated contribution to the current landing delay.
 * It compares the same kinetic model with and without that recorded drink.
 */
export function drinkRouteImpactMinutes(
  logs: LogEntry[],
  drinkId: string,
  halfLifeHours: number,
  nowMs: number,
): number {
  const activeFor = (entries: LogEntry[]) => entries
    .filter((log) => log.substanceType === 'caffeine' && log.timestamp <= nowMs)
    .reduce((total, log) => total + log.amountMg * Math.pow(.5, (nowMs - log.timestamp) / 3_600_000 / halfLifeHours), 0);
  const withDrink = sleepReadyAt(activeFor(logs), halfLifeHours, nowMs) ?? nowMs;
  const withoutDrink = sleepReadyAt(activeFor(logs.filter((log) => log.id !== drinkId)), halfLifeHours, nowMs) ?? nowMs;
  return Math.max(0, Math.round((withDrink - withoutDrink) / 60_000));
}

/** The next reasonable eight-hour sleep target based on tomorrow's wake-up time. */
export function tonightTargetSleepAt(wakeTime: string, nowMs: number): number {
  const [hours = 7, minutes = 30] = wakeTime.split(':').map(Number);
  const wake = new Date(nowMs);
  wake.setDate(wake.getDate() + 1);
  wake.setHours(hours, minutes, 0, 0);
  let target = wake.getTime() - 8 * 3_600_000;
  if (target <= nowMs) target += 24 * 3_600_000;
  return target;
}
