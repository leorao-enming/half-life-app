// =============================================================================
// src/store/useBioStore.ts
// Production Bio-State Store — Phase 2–6 Unified
//
// Architecture:
//   • Zustand + persist middleware → AsyncStorage (always-available local state)
//   • Supabase cloud sync with full offline-queue support
//   • Network awareness via expo-network (queues writes when offline)
//   • HealthKit metabolic multiplier integration
//   • BioHazard safety validation on every dose
// =============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as Network from 'expo-network';
import { createClient } from '@supabase/supabase-js';
import { calcDecaySimple, HALF_LIVES } from '../utils/kinetics';

// ---------------------------------------------------------------------------
// Supabase client (lazy – only initialised when env vars are present)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

const supabase = getSupabase();

// ---------------------------------------------------------------------------
// UUID helper (works on plain HTTP / dev)
// ---------------------------------------------------------------------------

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface MetabolismFactors {
  caffeine: number;
  sugar: number;
  sodium: number;
}

export interface BioProfile {
  userId: string;
  displayName: string;
  weightKg: number | null;
  metabolismFactors: MetabolismFactors;
  /**
   * HealthKit-derived RHR multiplier [0.70 – 1.00].
   * Feeds into the KineticsEngine to lengthen half-life when RHR is elevated.
   */
  healthKitMultiplier: number;
  allergies: string[];
  createdAt: number;
  updatedAt: number;
}

export type SubstanceType = 'caffeine' | 'sugar' | 'sodium' | 'other';

export interface LogEntry {
  id: string;
  label: string;
  substanceType: SubstanceType;
  amountMg: number;
  timestamp: number;
  note?: string;
  /** True when this entry is pending Supabase sync */
  pendingSync?: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'error';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface BioStoreState {
  profile: BioProfile;
  logs: LogEntry[];
  /** Logs that failed to sync while offline — replayed when network returns */
  offlineQueue: LogEntry[];
  supabaseUserId: string | null;
  syncStatus: SyncStatus;
}

interface BioStoreActions {
  addLog: (entry: Omit<LogEntry, 'id'>) => void;
  removeLog: (id: string) => void;
  updateBioProfile: (patch: Partial<Omit<BioProfile, 'userId' | 'createdAt'>>) => void;
  clearLogs: () => void;
  setSupabaseUser: (userId: string | null) => void;
  /** Set the HealthKit metabolic multiplier (called from root layout) */
  setHealthKitMultiplier: (multiplier: number) => void;
  /** Flush all queued offline logs to Supabase (call when network restores) */
  flushOfflineQueue: () => Promise<void>;
  /** Pull cloud logs for current user and merge without duplicates */
  syncFromCloud: (userId: string) => Promise<void>;
}

export type BioStore = BioStoreState & BioStoreActions;

// ---------------------------------------------------------------------------
// Safety thresholds (used by validateDose)
// ---------------------------------------------------------------------------

const SAFETY = {
  caffeine: { maxMg: 400 },
  sugar: { maxG: 50 }, // 50 g ≈ 50,000 mg in store
  sodium: { maxMg: 2300 },
} as const;

function safetyCheck(
  logs: LogEntry[],
  substanceType: SubstanceType,
  newDoseMg: number,
  cafFactor: number,
  healthKitMultiplier: number,
): { safe: boolean; message?: string } {
  const now = Date.now();

  if (substanceType === 'caffeine') {
    const hl = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMultiplier);
    const current = logs
      .filter((l) => l.substanceType === 'caffeine')
      .reduce((s, e) => s + calcDecaySimple(e.amountMg, (now - e.timestamp) / 3_600_000, hl), 0);
    if (current + newDoseMg > SAFETY.caffeine.maxMg) {
      return {
        safe: false,
        message: `Caffeine overload: ${(current + newDoseMg).toFixed(0)} mg would exceed the 400 mg safety ceiling.`,
      };
    }
  }

  if (substanceType === 'sodium') {
    const hl = HALF_LIVES.SODIUM;
    const current = logs
      .filter((l) => l.substanceType === 'sodium')
      .reduce((s, e) => s + calcDecaySimple(e.amountMg, (now - e.timestamp) / 3_600_000, hl), 0);
    if (current + newDoseMg > SAFETY.sodium.maxMg) {
      return {
        safe: false,
        message: `Sodium load: ${(current + newDoseMg).toFixed(0)} mg would exceed the 2,300 mg daily limit.`,
      };
    }
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Default profile
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: BioProfile = {
  userId: 'local-user',
  displayName: 'User',
  weightKg: null,
  metabolismFactors: { caffeine: 1.0, sugar: 1.0, sodium: 1.0 },
  healthKitMultiplier: 1.0,
  allergies: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBioStore = create<BioStore>()(
  persist(
    (set, get) => ({
      // ── Initial state ────────────────────────────────────────────────────
      profile: DEFAULT_PROFILE,
      logs: [],
      offlineQueue: [],
      supabaseUserId: null,
      syncStatus: 'idle' as SyncStatus,

      // ── addLog ───────────────────────────────────────────────────────────
      addLog: (entry) => {
        const { logs, profile, supabaseUserId, offlineQueue } = get();
        const id = uuid();

        // Safety validation
        const check = safetyCheck(
          logs,
          entry.substanceType,
          entry.amountMg,
          profile.metabolismFactors.caffeine,
          profile.healthKitMultiplier,
        );

        if (!check.safe) {
          Alert.alert('⚠ SAFETY LIMIT', check.message ?? 'Dose rejected.');
          return;
        }

        const newEntry: LogEntry = { ...entry, id, pendingSync: !!supabaseUserId };
        set({ logs: [...logs, newEntry] });

        // Async cloud persist (fire-and-forget with offline fallback)
        if (supabaseUserId && supabase) {
          void (async () => {
            try {
              const net = await Network.getNetworkStateAsync();
              if (!net.isConnected || !net.isInternetReachable) {
                set((s) => ({ offlineQueue: [...s.offlineQueue, { ...newEntry, pendingSync: true }] }));
                return;
              }

              const { error } = await supabase!.from('bio_logs').insert({
                id,
                user_id: supabaseUserId,
                label: entry.label,
                substance_type: entry.substanceType,
                amount_mg: entry.amountMg,
                timestamp: new Date(entry.timestamp).toISOString(),
                note: entry.note ?? null,
              });

              if (error) {
                const isTableMissing =
                  error.message.includes('does not exist') ||
                  error.message.includes('relation') ||
                  error.message.includes('Could not find');
                if (!isTableMissing) {
                  console.warn('[supabase] bio_logs insert failed:', error.message);
                }
                set((s) => ({ offlineQueue: [...s.offlineQueue, { ...newEntry, pendingSync: true }] }));
              } else {
                set((s) => ({
                  logs: s.logs.map((l) => l.id === id ? { ...l, pendingSync: false } : l),
                }));
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn('[supabase] addLog cloud sync error:', msg);
              set((s) => ({ offlineQueue: [...s.offlineQueue, { ...newEntry, pendingSync: true }] }));
            }
          })();
        }
      },

      // ── removeLog ────────────────────────────────────────────────────────
      removeLog: (id) => {
        set((s) => ({ logs: s.logs.filter((e) => e.id !== id) }));
      },

      // ── updateBioProfile ─────────────────────────────────────────────────
      updateBioProfile: (patch) => {
        set((s) => ({
          profile: {
            ...s.profile,
            ...patch,
            metabolismFactors: {
              ...s.profile.metabolismFactors,
              ...(patch.metabolismFactors ?? {}),
            },
            updatedAt: Date.now(),
          },
        }));
      },

      // ── setHealthKitMultiplier ────────────────────────────────────────────
      setHealthKitMultiplier: (multiplier) => {
        set((s) => ({
          profile: {
            ...s.profile,
            healthKitMultiplier: multiplier,
            updatedAt: Date.now(),
          },
        }));
      },

      // ── clearLogs ────────────────────────────────────────────────────────
      clearLogs: () => set({ logs: [], offlineQueue: [] }),

      // ── setSupabaseUser ──────────────────────────────────────────────────
      setSupabaseUser: (userId) => {
        set({ supabaseUserId: userId, syncStatus: userId ? 'syncing' : 'idle' });
        if (userId) {
          void get().syncFromCloud(userId);
          void get().flushOfflineQueue();
        }
      },

      // ── flushOfflineQueue ─────────────────────────────────────────────────
      flushOfflineQueue: async () => {
        const { offlineQueue, supabaseUserId } = get();
        if (!supabaseUserId || !supabase || offlineQueue.length === 0) return;

        try {
          const net = await Network.getNetworkStateAsync();
          if (!net.isConnected || !net.isInternetReachable) return;

          set({ syncStatus: 'syncing' });

          const rows = offlineQueue.map((e) => ({
            id: e.id,
            user_id: supabaseUserId,
            label: e.label,
            substance_type: e.substanceType,
            amount_mg: e.amountMg,
            timestamp: new Date(e.timestamp).toISOString(),
            note: e.note ?? null,
          }));

          const { error } = await supabase
            .from('bio_logs')
            .upsert(rows, { onConflict: 'id' });

          if (!error) {
            set((s) => ({
              offlineQueue: [],
              syncStatus: 'online',
              logs: s.logs.map((l) => ({ ...l, pendingSync: false })),
            }));
          } else {
            console.warn('[supabase] flushOfflineQueue failed:', error.message);
            set({ syncStatus: 'error' });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[supabase] flushOfflineQueue error:', msg);
          set({ syncStatus: 'error' });
        }
      },

      // ── syncFromCloud ────────────────────────────────────────────────────
      syncFromCloud: async (userId) => {
        if (!supabase) { set({ syncStatus: 'idle' }); return; }

        set({ syncStatus: 'syncing' });

        try {
          const { data, error } = await supabase
            .from('bio_logs')
            .select('id, label, substance_type, amount_mg, timestamp, note')
            .eq('user_id', userId)
            .order('timestamp', { ascending: true });

          if (error) throw error;

          const { logs } = get();
          const localIds = new Set(logs.map((l) => l.id));

          const newLogs: LogEntry[] = (data ?? [])
            .filter((r) => !localIds.has(r.id as string))
            .map((r) => ({
              id: r.id as string,
              label: (r.label as string) ?? '',
              substanceType: r.substance_type as SubstanceType,
              amountMg: r.amount_mg as number,
              timestamp: new Date(r.timestamp as string).getTime(),
              note: (r.note as string | null) ?? undefined,
              pendingSync: false,
            }));

          set((s) => ({
            logs: [...s.logs, ...newLogs].sort((a, b) => a.timestamp - b.timestamp),
            syncStatus: 'online',
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isTableMissing =
            msg.includes('does not exist') || msg.includes('Could not find the table');
          set({ syncStatus: isTableMissing ? 'idle' : 'error' });
          if (!isTableMissing) {
            Alert.alert('Neural Sync Failed', msg);
          }
        }
      },
    }),
    {
      name: 'half-life-bio-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        logs: state.logs,
        offlineQueue: state.offlineQueue,
        // supabaseUserId + syncStatus are session-transient — not persisted
      }),
      skipHydration: true,
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

// ── Raw data selectors (NO Date.now() inside — safe for Zustand subscriptions)
//
// CRITICAL: Selectors passed to useBioStore() must NOT call Date.now().
// If they do, useSyncExternalStoreWithSelector will always detect a "new
// value" (because time advances between renders) and trigger infinite
// re-renders after any store mutation (e.g. clicking Inject).
//
// Pattern: select raw stable data here; compute time-based values in the
// component via useMemo([...deps, nowMs]) where nowMs comes from setInterval.

/** All logs — stable array reference; changes only when a log is added/removed */
export const selectAllLogs = (s: BioStoreState): LogEntry[] => s.logs;

/** Caffeine metabolism factor (scalar) */
export const selectCafFactor = (s: BioStoreState): number =>
  s.profile.metabolismFactors.caffeine;

/** Sugar metabolism factor (scalar) */
export const selectSugarFactor = (s: BioStoreState): number =>
  s.profile.metabolismFactors.sugar;

/** Sodium metabolism factor (scalar) */
export const selectSodiumFactor = (s: BioStoreState): number =>
  s.profile.metabolismFactors.sodium;

/** HealthKit RHR multiplier */
export const selectHealthKitMultiplier = (s: BioStoreState): number =>
  s.profile.healthKitMultiplier;

/** Pending offline queue count */
export const selectOfflineQueueCount = (s: BioStoreState): number =>
  s.offlineQueue.length;

// ---------------------------------------------------------------------------
// Pure computation helpers
// ---------------------------------------------------------------------------
// Call these inside useMemo() in your component, passing an explicit nowMs
// timestamp so Date.now() never runs inside a Zustand selector.

/** Active caffeine (mg) at nowMs, adjusted by metabolism + HealthKit multiplier */
export function computeActiveCaffeine(
  logs: LogEntry[],
  cafFactor: number,
  healthKitMult: number,
  nowMs: number,
): number {
  const effectiveHL = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMult);
  return logs
    .filter((e) => e.substanceType === 'caffeine')
    .reduce(
      (total, e) => total + calcDecaySimple(e.amountMg, (nowMs - e.timestamp) / 3_600_000, effectiveHL),
      0,
    );
}

/** Active level (mg) for any substance at nowMs, respecting per-substance factor */
export function computeActiveBySubstance(
  logs: LogEntry[],
  substance: 'caffeine' | 'sugar' | 'sodium',
  factor: number,
  nowMs: number,
): number {
  const baseHL =
    substance === 'caffeine' ? HALF_LIVES.CAFFEINE :
    substance === 'sugar'    ? HALF_LIVES.SUGAR     : HALF_LIVES.SODIUM;
  const hl = baseHL / factor;
  return logs
    .filter((e) => e.substanceType === substance)
    .reduce(
      (total, e) => total + calcDecaySimple(e.amountMg, (nowMs - e.timestamp) / 3_600_000, hl),
      0,
    );
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward compatibility — prefer compute* above)
// ---------------------------------------------------------------------------

/** @deprecated Use computeActiveCaffeine() with an explicit nowMs instead */
export function selectActiveCaffeine(state: BioStoreState): number {
  const { logs, profile } = state;
  const now = Date.now();
  const effectiveHL = (HALF_LIVES.CAFFEINE / profile.metabolismFactors.caffeine) *
    (1 / profile.healthKitMultiplier);
  return logs
    .filter((e) => e.substanceType === 'caffeine')
    .reduce((total, e) => total + calcDecaySimple(e.amountMg, (now - e.timestamp) / 3_600_000, effectiveHL), 0);
}

/** @deprecated Use computeActiveBySubstance() with an explicit nowMs instead */
export function selectActiveBySubstance(
  state: BioStoreState,
  substance: 'caffeine' | 'sugar' | 'sodium',
): number {
  const { logs, profile } = state;
  const now = Date.now();
  const baseHL =
    substance === 'caffeine' ? HALF_LIVES.CAFFEINE :
    substance === 'sugar'    ? HALF_LIVES.SUGAR     : HALF_LIVES.SODIUM;
  const hl = baseHL / profile.metabolismFactors[substance];
  return logs
    .filter((e) => e.substanceType === substance)
    .reduce((total, e) => total + calcDecaySimple(e.amountMg, (now - e.timestamp) / 3_600_000, hl), 0);
}
