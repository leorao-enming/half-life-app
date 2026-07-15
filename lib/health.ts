// =============================================================================
// lib/health.ts
// HealthKit Integration — Phase 5 (The Moat)
//
// iOS-only module that requests HealthKit permissions after the user chooses
// to connect Apple Health, fetches the user's Resting Heart Rate (RHR) for the past 7 days, and derives a
// `metabolicMultiplier` that the KineticsEngine uses to personalise
// caffeine half-life calculations.
//
// Android: all functions no-op gracefully — the app is fully functional
// without HealthKit; the multiplier simply defaults to 1.0.
//
// Metabolic model:
//   Elevated RHR → increased sympathetic tone → slower CYP1A2 activity
//   → longer caffeine half-life.
//   multiplier = 1 − 0.3 × clamp((avgRHR − 60) / 40, 0, 1)
//   Range: 0.70 (very elevated RHR, ~100 bpm) → 1.00 (normal RHR, ≤60 bpm)
// =============================================================================

import { Platform } from 'react-native';
import * as Device from 'expo-device';

// ---------------------------------------------------------------------------
// Conditional import — react-native-health is iOS-native only
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleHealthKit: any | null = null;

if (Platform.OS === 'ios') {
  try {
    const RNHealth = require('react-native-health');
    AppleHealthKit = RNHealth.default ?? RNHealth.AppleHealthKit ?? null;
  } catch {
    // Native module not linked (e.g. Expo Go) — degrade silently
  }
}

// ---------------------------------------------------------------------------
// Permission manifest
// ---------------------------------------------------------------------------

const HEALTH_PERMISSIONS = {
  permissions: {
    read: [
      'HeartRate',
      'RestingHeartRate',
      'SleepAnalysis',
    ],
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RHRSample {
  /** Beats per minute */
  value: number;
  /** ISO 8601 date string */
  startDate: string;
  endDate: string;
}

export interface HealthKitStatus {
  available: boolean;
  authorized: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Request HealthKit permissions
// ---------------------------------------------------------------------------

/**
 * Requests read access for HeartRate and SleepAnalysis from HealthKit.
 * Returns a status object indicating whether authorization was granted.
 * Safe to call on Android — returns `{ available: false, authorized: false }`.
 */
export async function requestHealthKitPermissions(): Promise<HealthKitStatus> {
  if (Platform.OS !== 'ios' || !AppleHealthKit) {
    return { available: false, authorized: false };
  }

  if (__DEV__ && Device.isDevice === false) {
    console.warn('[HealthKit] HealthKit won\'t work on Simulators — use a physical device.');
    return { available: false, authorized: false, error: 'Simulator detected' };
  }

  return new Promise((resolve) => {
    AppleHealthKit!.initHealthKit(HEALTH_PERMISSIONS, (err: string | null) => {
      if (err) {
        resolve({
          available: true,
          authorized: false,
          error: err,
        });
      } else {
        resolve({ available: true, authorized: true });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Fetch last 7 days of Resting Heart Rate
// ---------------------------------------------------------------------------

/**
 * Fetches Resting Heart Rate samples from HealthKit for the past 7 days.
 *
 * Falls back to [] on Android, permission denial, or if the user has no
 * RHR data (e.g. no Apple Watch).
 */
export async function fetchLastSevenDaysRHR(): Promise<RHRSample[]> {
  if (Platform.OS !== 'ios' || !AppleHealthKit) return [];

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  return new Promise((resolve) => {
    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false,
      limit: 28, // Up to 4 readings/day × 7 days
    };

    // Try RestingHeartRate first (Apple Watch resting average), fall back to HeartRate
    AppleHealthKit!.getRestingHeartRateSamples(
      options,
      (err: string | null, results: RHRSample[]) => {
        if (err || !results || results.length === 0) {
          // Fallback: derive from general heart rate samples
          AppleHealthKit!.getHeartRateSamples(
            options,
            (err2: string | null, hrResults: RHRSample[]) => {
              if (err2 || !hrResults) {
                resolve([]);
              } else {
                // Filter to likely resting measurements (early morning / overnight)
                const resting = hrResults.filter((s) => {
                  const hour = new Date(s.startDate).getHours();
                  return (hour >= 1 && hour <= 6) || s.value < 75;
                });
                resolve(resting);
              }
            },
          );
        } else {
          resolve(results);
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Derive metabolic multiplier from RHR data
// ---------------------------------------------------------------------------

/**
 * Converts an array of RHR samples into a scalar `metabolicMultiplier` for
 * the KineticsEngine's caffeine half-life calculation.
 *
 * Formula:
 *   avgRHR = mean of the provided samples
 *   stress = clamp((avgRHR − 60) / 40, 0, 1)   // 0 at ≤60 bpm, 1 at ≥100 bpm
 *   multiplier = 1 − 0.30 × stress              // range: [0.70, 1.00]
 *
 * A multiplier < 1 lengthens the effective half-life (caffeine clears slower),
 * modelling CYP1A2 enzyme suppression under sympathetic stress.
 *
 * @returns 1.0 when no data is available (no-op)
 */
export function calculateMetabolicMultiplier(samples: RHRSample[]): number {
  if (samples.length === 0) return 1.0;

  const avg = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;

  // Clamp the deviation above 60 bpm into [0,1]
  const stress = Math.min(1, Math.max(0, (avg - 60) / 40));

  // Lower multiplier = longer half-life = slower caffeine clearance
  return parseFloat((1.0 - 0.3 * stress).toFixed(3));
}

// ---------------------------------------------------------------------------
// Convenience: one-shot init + fetch + multiplier
// ---------------------------------------------------------------------------

/**
 * High-level helper that:
 *   1. Requests HealthKit permissions (safe no-op on Android)
 *   2. Fetches the last 7 days of RHR
 *   3. Returns the metabolic multiplier and raw samples
 *
 * Designed to be called after the user chooses to connect Apple Health.
 */
export async function initHealthKit(): Promise<{
  multiplier: number;
  samples: RHRSample[];
  status: HealthKitStatus;
}> {
  try {
    const status = await requestHealthKitPermissions();

    if (!status.authorized) {
      return { multiplier: 1.0, samples: [], status };
    }

    const samples = await fetchLastSevenDaysRHR();
    const multiplier = calculateMetabolicMultiplier(samples);

    return { multiplier, samples, status };
  } catch (error) {
    console.error('[health] initHealthKit failed:', error);
    return {
      multiplier: 1.0,
      samples: [],
      status: {
        available: false,
        authorized: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
