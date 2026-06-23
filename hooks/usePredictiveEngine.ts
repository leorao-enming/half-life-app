// =============================================================================
// hooks/usePredictiveEngine.ts
// Background Intelligence Engine — Phase 4
//
// Registers an Expo BackgroundFetch task that runs every ~15 minutes even
// when the app is closed. The task reads the persisted BioStore state from
// AsyncStorage, runs the pharmacokinetic engine, and fires local push
// notifications for two critical bio-events:
//
//   1. SUGAR CRASH    — blood glucose falling below the crash threshold
//   2. CAFFEINE CLEAR — plasma caffeine dropping to near-zero clearance
//
// The hook also exposes a `scheduleImmediateCheck()` function for triggering
// a foreground check (e.g. immediately after an injection).
// =============================================================================

import { useEffect, useCallback } from 'react';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { calcDecaySimple, HALF_LIVES } from '../src/utils/kinetics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BG_TASK_NAME = 'HALF_LIFE_BG_KINETICS_CHECK';

/** Sugar spike threshold below which a crash notification fires (display units) */
const SUGAR_CRASH_THRESHOLD = 12;

/** Caffeine level below which clearance is considered complete (mg) */
const CAFFEINE_CLEAR_THRESHOLD = 8;

/** Minimum interval between identical notification types (ms) — avoid spam */
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// AsyncStorage keys
// ---------------------------------------------------------------------------

const STORE_KEY = 'half-life-bio-store';
const LAST_SUGAR_NOTIF_KEY = 'hl_last_sugar_notif';
const LAST_CAF_NOTIF_KEY = 'hl_last_caf_notif';

// ---------------------------------------------------------------------------
// Notification channel setup (Android)
// ---------------------------------------------------------------------------

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('biohazard', {
      name: 'Half-Life Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 100, 250],
      lightColor: '#FF073A',
      sound: 'default',
    });
  }
}

// ---------------------------------------------------------------------------
// Background task definition
// Must be called at module level (outside components) before app renders.
// ---------------------------------------------------------------------------

TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;

    const stored = JSON.parse(raw) as {
      state?: {
        logs?: Array<{
          id: string;
          substanceType: string;
          amountMg: number;
          timestamp: number;
        }>;
        profile?: {
          metabolismFactors?: { caffeine?: number; sugar?: number };
        };
      };
    };

    const logs = stored?.state?.logs ?? [];
    const cafFactor = stored?.state?.profile?.metabolismFactors?.caffeine ?? 1.0;
    const now = Date.now();

    // ── Caffeine level calculation ──────────────────────────────────────
    const effectiveCafHL = HALF_LIVES.CAFFEINE / cafFactor;
    const totalCaffeine = logs
      .filter((l) => l.substanceType === 'caffeine')
      .reduce((sum, entry) => {
        const elapsed = (now - entry.timestamp) / 3_600_000;
        return sum + calcDecaySimple(entry.amountMg, elapsed, effectiveCafHL);
      }, 0);

    // ── Sugar level calculation ─────────────────────────────────────────
    const totalSugar = logs
      .filter((l) => l.substanceType === 'sugar')
      .reduce((sum, entry) => {
        const elapsed = (now - entry.timestamp) / 3_600_000;
        return sum + calcDecaySimple(entry.amountMg / 1000, elapsed, HALF_LIVES.SUGAR);
      }, 0);

    let fired = false;

    // ── Sugar crash check ───────────────────────────────────────────────
    const hasSugarLogs = logs.some((l) => l.substanceType === 'sugar');
    if (hasSugarLogs && totalSugar < SUGAR_CRASH_THRESHOLD && totalSugar > 0) {
      const lastNotif = await AsyncStorage.getItem(LAST_SUGAR_NOTIF_KEY);
      const elapsed = lastNotif ? now - parseInt(lastNotif, 10) : Infinity;
      if (elapsed > NOTIFICATION_COOLDOWN_MS) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚠ SUGAR CRASH IMMINENT',
            body: `Blood glucose falling (${totalSugar.toFixed(1)} AU). Fuel up now.`,
            data: { type: 'sugar_crash', level: totalSugar },
            sound: 'default',
            color: '#FF073A',
          },
          trigger: null, // fire immediately
        });
        await AsyncStorage.setItem(LAST_SUGAR_NOTIF_KEY, String(now));
        fired = true;
      }
    }

    // ── Caffeine clearance check ────────────────────────────────────────
    const hasCafLogs = logs.some((l) => l.substanceType === 'caffeine');
    if (hasCafLogs && totalCaffeine < CAFFEINE_CLEAR_THRESHOLD && totalCaffeine > 0) {
      const lastNotif = await AsyncStorage.getItem(LAST_CAF_NOTIF_KEY);
      const elapsed = lastNotif ? now - parseInt(lastNotif, 10) : Infinity;
      if (elapsed > NOTIFICATION_COOLDOWN_MS) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '✓ CAFFEINE CLEARANCE COMPLETE',
            body: `System clear (${totalCaffeine.toFixed(1)} mg). Adenosine receptors fully open.`,
            data: { type: 'caffeine_clear', level: totalCaffeine },
            sound: 'default',
            color: '#39FF14',
          },
          trigger: null,
        });
        await AsyncStorage.setItem(LAST_CAF_NOTIF_KEY, String(now));
        fired = true;
      }
    }

    return fired
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface PredictiveEngineState {
  /** Trigger an immediate foreground kinetics check + notification dispatch */
  scheduleImmediateCheck: () => Promise<void>;
  /** Re-register the background fetch task (call on permission grant) */
  registerBackgroundTask: () => Promise<void>;
}

/**
 * Registers the background fetch task and returns helpers for triggering
 * immediate checks. Should be mounted once at the root layout level.
 *
 * @param metabolicMultiplier - Optional HealthKit-derived multiplier [0.7–1.0]
 */
export function usePredictiveEngine(
  metabolicMultiplier: number = 1.0,
): PredictiveEngineState {

  const registerBackgroundTask = useCallback(async () => {
    try {
      await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes (iOS minimum)
        stopOnTerminate: false,   // keep running after app is closed
        startOnBoot: true,        // restart after device reboot
      });
    } catch {
      // Task already registered or platform limitation — ignore
    }
  }, []);

  const scheduleImmediateCheck = useCallback(async () => {
    // Re-use the same logic as the background task but in-process
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (!raw) return;

      const stored = JSON.parse(raw) as {
        state?: {
          logs?: Array<{
            substanceType: string;
            amountMg: number;
            timestamp: number;
          }>;
          profile?: { metabolismFactors?: { caffeine?: number } };
        };
      };

      const logs = stored?.state?.logs ?? [];
      const cafFactor = (stored?.state?.profile?.metabolismFactors?.caffeine ?? 1.0)
        * metabolicMultiplier;
      const now = Date.now();

      const effectiveCafHL = HALF_LIVES.CAFFEINE / cafFactor;
      const totalCaffeine = logs
        .filter((l) => l.substanceType === 'caffeine')
        .reduce((sum, e) => {
          return sum + calcDecaySimple(
            e.amountMg,
            (now - e.timestamp) / 3_600_000,
            effectiveCafHL,
          );
        }, 0);

      const totalSugar = logs
        .filter((l) => l.substanceType === 'sugar')
        .reduce((sum, e) => {
          return sum + calcDecaySimple(
            e.amountMg / 1000,
            (now - e.timestamp) / 3_600_000,
            HALF_LIVES.SUGAR,
          );
        }, 0);

      // Only fire "foreground" checks if levels are in alert range
      if (totalSugar < SUGAR_CRASH_THRESHOLD && totalSugar > 0 &&
          logs.some((l) => l.substanceType === 'sugar')) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚠ SUGAR CRASH IMMINENT',
            body: `Blood glucose falling (${totalSugar.toFixed(1)} AU). Fuel up now.`,
            data: { type: 'sugar_crash' },
            sound: 'default',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false },
        });
      }

      if (totalCaffeine < CAFFEINE_CLEAR_THRESHOLD && totalCaffeine > 0 &&
          logs.some((l) => l.substanceType === 'caffeine')) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '✓ CAFFEINE CLEARANCE COMPLETE',
            body: `System clear (${totalCaffeine.toFixed(1)} mg).`,
            data: { type: 'caffeine_clear' },
            sound: 'default',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false },
        });
      }
    } catch {
      // Non-fatal
    }
  }, [metabolicMultiplier]);

  // Register background task on mount
  useEffect(() => {
    void registerBackgroundTask();
  }, [registerBackgroundTask]);

  return { scheduleImmediateCheck, registerBackgroundTask };
}
