// =============================================================================
// app/(tabs)/index.tsx
// REACTOR — Main Dashboard  (Step 1 Restoration)
//
// Safety changes vs. full version:
//   ✅ react-native-svg         → removed (replaced with View-based ring)
//   ✅ expo-linear-gradient     → removed (plain dark View background)
//   ✅ expo-blur / BlurView     → removed (plain semi-transparent View)
//   ✅ All useEffect hooks      → commented out (re-enable one at a time)
//   ✅ Animated.Value init      → set to 1 so UI is visible without effects
//   ✅ HealthKit init           → moved to "Manual Sync Health" button onPress
//   ✅ Supabase session         → checked once via useEffect, no router.replace
// =============================================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Animated,
  DimensionValue,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  selectAllLogs,
  selectCafFactor,
  selectSugarFactor,
  selectSodiumFactor,
  selectHealthKitMultiplier,
  selectOfflineQueueCount,
  computeActiveCaffeine,
  computeActiveBySubstance,
  useBioStore,
} from '../../src/store/useBioStore';
import { HALF_LIVES } from '../../src/utils/kinetics';
import { initHealthKit } from '../../lib/health';

// ─── Env var check (logged once at module load) ───────────────────────────────
console.log(
  '[reactor] EXPO_PUBLIC_SUPABASE_URL:',
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '⚠ MISSING — add to .env and restart dev server',
);

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  BG:      '#000000',
  BORDER:  '#1A1A1A',
  NEON_G:  '#39FF14',
  NEON_Y:  '#FFFF33',
  ELEC_B:  '#0FF0FC',
  BLOOD_R: '#FF073A',
  TEXT:    '#FFFFFF',
  DIM:     '#2A2A2A',
  MID:     '#555555',
} as const;

const MONO = Platform.select({
  ios:     'Menlo',
  android: 'monospace',
  default: 'monospace',
});

// ─── Ring geometry (kept for layout math) ────────────────────────────────────

const RING_SIZE   = 264;

// ─── Domain constants ─────────────────────────────────────────────────────────

const SODIUM_LIMIT_MG   = 2_300;
const SUGAR_LIMIT_MG    = 50_000;
const CAFFEINE_CLEAR_MG = 5;
const DEMO_SECONDS      = 5 * 3_600;
const DEMO_SODIUM_PCT   = 0.70;
const DEMO_SUGAR_PCT    = 0.20;

const WAVE_BARS: number[] = Array.from({ length: 32 }, (_, i) => {
  const decay  = Math.pow(0.5, i / 8) * 36;
  const ripple = Math.sin(i * 0.85) * 3;
  return Math.max(3, decay + ripple);
});
const WAVE_ACTIVE_COUNT = Math.floor(WAVE_BARS.length * 0.65);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(totalSec: number): string {
  if (totalSec <= 0) return '00:00:00';
  const h   = Math.floor(totalSec / 3_600);
  const m   = Math.floor((totalSec % 3_600) / 60);
  const sec = totalSec % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

function clearanceSecs(mg: number, halfLifeH: number): number {
  if (mg <= CAFFEINE_CLEAR_MG) return 0;
  return Math.round(halfLifeH * Math.log2(mg / CAFFEINE_CLEAR_MG) * 3_600);
}

interface StatusConfig { text: string; color: string }
function resolveStatus(mg: number): StatusConfig {
  if (mg > 200) return { text: 'OVERCHARGED', color: C.NEON_Y  };
  if (mg > 100) return { text: 'OPTIMAL',     color: C.ELEC_B  };
  if (mg > 20)  return { text: 'DECLINING',   color: C.BLOOD_R };
  return               { text: 'STANDBY',     color: C.NEON_G  };
}

// ─── ReactorRing — SVG arc progress ring ─────────────────────────────────────

interface ReactorRingProps {
  progress: number;
  color: string;
}

function ReactorRing({ progress, color }: ReactorRingProps) {
  const clamped       = Math.max(0, Math.min(1, progress));
  const pct           = Math.round(clamped * 100);
  const cx            = RING_SIZE / 2;
  const cy            = RING_SIZE / 2;
  const R_TRACK       = (RING_SIZE - 20) / 2 - 2;
  const R_OUTER       = (RING_SIZE - 10) / 2 - 1;
  const R_INNER       = (RING_SIZE - 50) / 2;
  const circumference = 2 * Math.PI * R_TRACK;
  const dashOffset    = circumference * (1 - clamped);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      {/* Outer dim decorative ring */}
      <Circle
        cx={cx} cy={cy} r={R_OUTER}
        fill="none"
        stroke={C.BORDER}
        strokeWidth={1.5}
      />
      {/* Inner tick ring */}
      <Circle
        cx={cx} cy={cy} r={R_INNER}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.16}
      />
      {/* Track (background circle) */}
      <Circle
        cx={cx} cy={cy} r={R_TRACK}
        fill="none"
        stroke={C.BORDER}
        strokeWidth={2.5}
      />
      {/* Glow halo */}
      <Circle
        cx={cx} cy={cy} r={R_TRACK}
        fill="none"
        stroke={color}
        strokeWidth={14}
        opacity={0.09 + clamped * 0.08}
      />
      {/* Progress arc */}
      <Circle
        cx={cx} cy={cy} r={R_TRACK}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        opacity={0.4 + clamped * 0.6}
      />
    </Svg>
  );
}

// ─── GlassCard — safe plain View (no BlurView) ───────────────────────────────
// BlurView removed. Restore after stable.

interface GlassCardProps {
  children: React.ReactNode;
  accentColor?: string;
}

function GlassCard({ children, accentColor = C.ELEC_B }: GlassCardProps) {
  return (
    <View style={[s.glassWrapper, { borderColor: `${accentColor}28` }]}>
      <View style={s.glassContent}>{children}</View>
    </View>
  );
}

// ─── BarRow ───────────────────────────────────────────────────────────────────

interface BarRowProps { label: string; pct: number; color: string; sub: string }

function BarRow({ label, pct, color, sub }: BarRowProps) {
  const clamped  = Math.max(0, Math.min(1, pct));
  const widthStr = `${Math.round(clamped * 100)}%` as DimensionValue;

  return (
    <View>
      <View style={s.barHeader}>
        <Text style={s.barLabel}>{label}</Text>
        <Text style={[s.barPct, { color }]}>{Math.round(clamped * 100)}%</Text>
      </View>
      <View style={s.barTrackOuter}>
        <View style={s.barTrackBg} />
        <View style={[s.barGlow, { width: widthStr, backgroundColor: color }]} />
        <View style={[s.barFill, { width: widthStr, backgroundColor: color }]} />
        {clamped > 0.02 && (
          <View style={[s.barDot, { left: widthStr, backgroundColor: color }]} />
        )}
      </View>
      <Text style={s.barSub}>{sub}</Text>
    </View>
  );
}

// ─── SyncIndicator ────────────────────────────────────────────────────────────

function SyncIndicator() {
  const queueCount = useBioStore((s) => selectOfflineQueueCount(s));
  const syncStatus = useBioStore((s) => s.syncStatus);

  if (queueCount === 0 && syncStatus !== 'error') return null;

  const color = syncStatus === 'error' ? C.BLOOD_R : C.NEON_Y;
  const label = syncStatus === 'error'
    ? 'SYNC ERROR'
    : `${queueCount} PENDING`;

  return (
    <View style={[s.syncBadge, { borderColor: `${color}44`, backgroundColor: `${color}10` }]}>
      <Text style={[s.syncBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const insets = useSafeAreaInsets();

  // ── Raw store data — stable refs, no Date.now() inside selectors ─────────
  // (Inline Date.now() selectors cause infinite re-render loops after inject)
  const logs          = useBioStore(selectAllLogs);
  const cafFactor     = useBioStore(selectCafFactor);
  const sugarFactor   = useBioStore(selectSugarFactor);
  const sodiumFactor  = useBioStore(selectSodiumFactor);
  const healthKitMult = useBioStore(selectHealthKitMultiplier);

  // ── nowMs — ticks every second, drives all time-based computations ────────
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Active substance levels — computed via useMemo, loop-safe ─────────────
  const activeCaffeineMg = useMemo(
    () => computeActiveCaffeine(logs, cafFactor, healthKitMult, nowMs),
    [logs, cafFactor, healthKitMult, nowMs],
  );
  const activeSodiumMg = useMemo(
    () => computeActiveBySubstance(logs, 'sodium', sodiumFactor, nowMs),
    [logs, sodiumFactor, nowMs],
  );
  const activeSugarMg = useMemo(
    () => computeActiveBySubstance(logs, 'sugar', sugarFactor, nowMs),
    [logs, sugarFactor, nowMs],
  );
  const hasCaf    = useMemo(() => logs.some((l) => l.substanceType === 'caffeine'), [logs]);
  const hasSodium = useMemo(() => logs.some((l) => l.substanceType === 'sodium'),   [logs]);
  const hasSugar  = useMemo(() => logs.some((l) => l.substanceType === 'sugar'),    [logs]);

  // ── Animated refs — start at 0, entrance animation drives to 1 ───────────
  const ringFadeAnim   = useRef(new Animated.Value(0)).current;
  const ringScaleAnim  = useRef(new Animated.Value(0.92)).current;
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  // ── Auth — read from central store (set by _layout.tsx boot sequence) ───────
  const supabaseUserId = useBioStore((s) => s.supabaseUserId);

  // ── HealthKit sync state ──────────────────────────────────────────────────
  const [hkStatus, setHkStatus] = useState<string>('');
  const [hkLoading, setHkLoading] = useState(false);

  // ── Entrance animations ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.timing(ringFadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(ringScaleAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BioHazard status haptics ──────────────────────────────────────────────
  const prevStatusRef = useRef<string>('STANDBY');
  useEffect(() => {
    const current = resolveStatus(activeCaffeineMg).text;
    if (current !== prevStatusRef.current) {
      if (current === 'OVERCHARGED') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (activeCaffeineMg < CAFFEINE_CLEAR_MG && hasCaf) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      prevStatusRef.current = current;
    }
  }, [activeCaffeineMg, hasCaf]);

  // ── Live countdown — derived from activeCaffeineMg (updates via nowMs) ────
  const totalSecsRef = useRef<number | null>(null);

  // Track peak clearance time for ring progress ratio
  useEffect(() => {
    if (hasCaf && activeCaffeineMg > CAFFEINE_CLEAR_MG) {
      const hl      = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMult);
      const computed = clearanceSecs(activeCaffeineMg, hl);
      if (totalSecsRef.current === null || computed > totalSecsRef.current) {
        totalSecsRef.current = computed;
      }
    } else {
      totalSecsRef.current = null;
    }
  }, [activeCaffeineMg, hasCaf, cafFactor, healthKitMult]);

  // secs is a derived value — no separate state needed (activeCaffeineMg ticks via nowMs)
  const secs = useMemo(() => {
    if (hasCaf && activeCaffeineMg > CAFFEINE_CLEAR_MG) {
      const hl = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMult);
      return clearanceSecs(activeCaffeineMg, hl);
    }
    return DEMO_SECONDS;
  }, [activeCaffeineMg, hasCaf, cafFactor, healthKitMult]);

  const ringProgress =
    hasCaf && totalSecsRef.current !== null && totalSecsRef.current > 0
      ? secs / totalSecsRef.current
      : 0.65;

  // ── FAB handlers ─────────────────────────────────────────────────────────
  const onFabPressIn  = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);
  const onFabPressOut = useCallback(() => {}, []);

  // Guest-aware Injector navigation: Reactor is always accessible, but the
  // Injector prompts for login when cloud sync would silently fail.
  const onFabPress = useCallback(() => {
    if (!supabaseUserId) {
      Alert.alert(
        'LOGIN TO SYNC',
        'You\'re in guest mode. Injections are saved locally only and will not sync across devices.\n\nLog in to enable full cloud sync.',
        [
          {
            text: 'Continue as Guest',
            style: 'default',
            onPress: () => router.push('/inject'),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    router.push('/inject');
  }, [supabaseUserId]);

  // ── Manual Sync Health button handler ────────────────────────────────────
  const onManualSyncHealth = useCallback(async () => {
    if (hkLoading) return;
    setHkLoading(true);
    setHkStatus('REQUESTING PERMISSIONS...');
    try {
      const result = await initHealthKit();
      console.log("[HealthKit] initHealthKit result:", result);
      if (result.status.available && result.status.authorized) {
        setHkStatus(`HK ✓  MULTIPLIER: ${result.multiplier.toFixed(3)}  SAMPLES: ${result.samples.length}`);
      } else if (!result.status.available) {
        setHkStatus(
          Platform.OS !== 'ios'
            ? 'HK — NOT AVAILABLE ON ANDROID'
            : 'HK — NOT AVAILABLE ON THIS DEVICE  ·  REQUIRES DEV BUILD (NOT EXPO GO)  ·  CHECK: IPAD OR RESTRICTED PERMISSIONS?',
        );
      } else {
        setHkStatus(`HK ✗  ${result.status.error ?? 'PERMISSION DENIED — OPEN SETTINGS > HEALTH > HALF-LIFE'}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[HealthKit] Manual sync failed:", e);
      setHkStatus(`HK ERROR: ${msg}`);
    } finally {
      setHkLoading(false);
    }
  }, [hkLoading]);

  // ── Derived display values ───────────────────────────────────────────────
  const displayMg = hasCaf ? activeCaffeineMg : 210;
  const status    = resolveStatus(displayMg);

  const sodiumPct = hasSodium ? Math.min(activeSodiumMg / SODIUM_LIMIT_MG, 1) : DEMO_SODIUM_PCT;
  const sugarPct  = hasSugar  ? Math.min(activeSugarMg  / SUGAR_LIMIT_MG,  1) : DEMO_SUGAR_PCT;

  const cafFooter = hasCaf
    ? `${activeCaffeineMg.toFixed(0)} MG ACTIVE`
    : 'DEMO  ·  LOG TO ACTIVATE';
  const sodiumSub = hasSodium
    ? `${activeSodiumMg.toFixed(0)} MG ACTIVE`
    : '1,610 MG  ·  LIMIT 2,300 MG';
  const sugarSub  = hasSugar
    ? `${(activeSugarMg / 1_000).toFixed(1)} G ACTIVE`
    : '10.0 G  ·  LIMIT 50 G';

  const dateStr = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase();

  const supabaseConfigured = !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  const authLabel = !supabaseConfigured
    ? '⚠  SUPABASE ENV VARS MISSING'
    : supabaseUserId
      ? 'USER LOGGED IN'
      : 'GUEST MODE';

  const authColor = !supabaseConfigured
    ? C.NEON_Y
    : supabaseUserId
      ? C.NEON_G
      : C.MID;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>

      {/* Background — plain dark View (LinearGradient removed, restore later) */}
      <View style={[StyleSheet.absoluteFill, s.bgPlain]} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        bounces
      >

      {/* §1  HEADER */}
      <Animated.View style={[s.section1, { opacity: headerFadeAnim }]}>

        <View style={s.topBar}>
          <Text style={s.appName}>HALF-LIFE</Text>
          <View style={s.topBarRight}>
            <SyncIndicator />
            <Text style={s.topBarDate}>{dateStr}</Text>
            <View style={[s.liveDot, {
              backgroundColor: status.color,
              shadowColor:     status.color,
              shadowOffset:    { width: 0, height: 0 },
              shadowOpacity:   0.95,
              shadowRadius:    8,
              elevation:       6,
            }]} />
          </View>
        </View>

        {/* Auth status badge */}
        <View style={s.authRow}>
          <Text style={[s.authLabel, { color: authColor }]}>
            {'\u2022'}  {authLabel}
          </Text>
        </View>

        <View style={s.statusRow}>
          <Text style={s.statusLabel}>SYSTEM STATUS</Text>
          <Text style={[s.statusHeadline, {
            color:         status.color,
            shadowColor:   status.color,
            shadowOffset:  { width: 0, height: 0 },
            shadowOpacity: 0.85,
            shadowRadius:  20,
          }]}>
            {status.text}
          </Text>
          {healthKitMult < 0.99 && (
            <Text style={[s.hkBadge, { color: `${C.NEON_G}99` }]}>
              {'\u2665'} RHR ACTIVE · {((1 - healthKitMult) * 100).toFixed(0)}% EXTENDED HALF-LIFE
            </Text>
          )}
        </View>

        <View style={s.waveRow}>
          {WAVE_BARS.map((h, i) => (
            <View
              key={i}
              style={[s.waveBar, {
                height:          h,
                backgroundColor: i < WAVE_ACTIVE_COUNT ? status.color : C.BORDER,
                opacity:         i < WAVE_ACTIVE_COUNT
                  ? Math.max(0.3, 0.95 - i * 0.018)
                  : 0.12,
              }]}
            />
          ))}
        </View>
        <Text style={s.waveCaption}>{'▸  CAFFEINE DECAY CURVE'}</Text>

      </Animated.View>

      {/* §2  REACTOR RING (View-based, SVG restored later) */}
      <Animated.View
        style={[
          s.section2,
          {
            opacity:   ringFadeAnim,
            transform: [{ scale: ringScaleAnim }],
          },
        ]}
      >
        <View style={s.ringContainer}>
          <View
            style={[s.glowAura, {
              backgroundColor: C.BG,
              shadowColor:     status.color,
              shadowOffset:    { width: 0, height: 0 },
              shadowOpacity:   0.95,
              shadowRadius:    64,
              elevation:       24,
            }]}
          />

          <ReactorRing progress={ringProgress} color={status.color} />

          {/* Timer overlay */}
          <View style={s.ringInner}>
            <View style={[s.scanLine, s.scanTop,    { borderColor: `${status.color}22` }]} />
            <View style={[s.scanLine, s.scanBottom, { borderColor: `${status.color}22` }]} />

            <Text style={[s.timerText, {
              color:         status.color,
              shadowColor:   status.color,
              shadowOffset:  { width: 0, height: 0 },
              shadowOpacity: 0.90,
              shadowRadius:  16,
            }]}>
              {fmtTime(secs)}
            </Text>

            <View style={[s.timerRule, { backgroundColor: `${status.color}50` }]} />

            <Text style={[s.timerCaption, { color: `${status.color}88` }]}>
              {'UNTIL CAFFEINE\nCLEARED'}
            </Text>
          </View>

        </View>

        <Text style={s.ringFooter}>{cafFooter}</Text>
      </Animated.View>

      {/* §3  INSIGHT CARDS + BUTTONS */}
      <View style={s.section3}>

        <GlassCard accentColor={C.ELEC_B}>
          <BarRow label="SODIUM LOAD"  pct={sodiumPct} color={C.ELEC_B}  sub={sodiumSub} />
          <View style={s.barGap}>
            <BarRow label="SUGAR SPIKE" pct={sugarPct}  color={C.BLOOD_R} sub={sugarSub}  />
          </View>
        </GlassCard>

        {/* Manual Sync Health button */}
        <Pressable
          onPress={onManualSyncHealth}
          accessibilityRole="button"
          accessibilityLabel="Manual Sync Health"
          style={({ pressed }) => [
            s.syncBtn,
            { borderColor: `${C.NEON_G}66`, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={s.syncBtnText}>
            {hkLoading ? '⟳  SYNCING...' : '♥  MANUAL SYNC HEALTH'}
          </Text>
          {hkStatus !== '' && (
            <Text style={s.syncBtnSub}>{hkStatus}</Text>
          )}
        </Pressable>

        {/* FAB — INJECT */}
        <Pressable
          onPressIn={onFabPressIn}
          onPressOut={onFabPressOut}
          onPress={onFabPress}
          accessibilityRole="button"
          accessibilityLabel="Open injector"
        >
          <View style={[s.fab, {
            borderColor:   status.color,
            shadowColor:   status.color,
            shadowOffset:  { width: 0, height: 0 },
            shadowOpacity: 0.90,
            shadowRadius:  28,
            elevation:     20,
          }]}>
            <Text style={[s.fabText, {
              color:         status.color,
              shadowColor:   status.color,
              shadowOffset:  { width: 0, height: 0 },
              shadowOpacity: 0.85,
              shadowRadius:  10,
            }]}>
              +  INJECT
            </Text>
          </View>
        </Pressable>

      </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.BG,
  },
  bgPlain: {
    backgroundColor: '#04040E',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  section1: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 8,
    color: C.DIM,
    fontWeight: '700',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarDate: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 2,
    color: C.MID,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  syncBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  syncBadgeText: {
    fontFamily: MONO,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: '700',
  },

  authRow: {
    alignItems: 'flex-start',
    marginTop: 2,
  },
  authLabel: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
  },

  statusRow: {
    alignItems: 'center',
    gap: 2,
  },
  statusLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    color: C.MID,
  },
  statusHeadline: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
  },
  hkBadge: {
    fontFamily: MONO,
    fontSize: 7,
    letterSpacing: 2,
    marginTop: 2,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 40,
    gap: 3,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
  },
  waveCaption: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 3,
    color: C.DIM,
    textAlign: 'center',
  },

  section2: {
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowAura: {
    position:     'absolute',
    width:        RING_SIZE,
    height:       RING_SIZE,
    borderRadius: RING_SIZE / 2,
  },
  ringInner: {
    position:       'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scanLine: {
    position:       'absolute',
    left:           40,
    right:          40,
    height:         1,
    borderTopWidth: 1,
  },
  scanTop:    { top:    '24%' },
  scanBottom: { bottom: '24%' },
  timerText: {
    fontFamily:    MONO,
    fontSize:      30,
    fontWeight:    '700',
    letterSpacing: 3,
    fontVariant:   ['tabular-nums'],
  },
  timerRule: {
    width:          48,
    height:         1,
    marginVertical: 10,
  },
  timerCaption: {
    fontFamily:    MONO,
    fontSize:      7,
    letterSpacing: 2,
    textAlign:     'center',
    lineHeight:    13,
  },
  ringFooter: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 3,
    color:         C.DIM,
    marginTop:     14,
    textAlign:     'center',
  },

  section3: {
    paddingHorizontal: 18,
    paddingBottom:     12,
    gap:               12,
  },
  glassWrapper: {
    borderRadius:    24,
    borderWidth:     1,
    backgroundColor: '#0C0C0C',
    shadowColor:     '#000000',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.55,
    shadowRadius:    16,
    elevation:       10,
  },
  glassContent: {
    padding:         20,
    borderRadius:    24,
    overflow:        'hidden',
    backgroundColor: 'rgba(255,255,255,0.040)',
  },

  barGap: { marginTop: 16 },
  barHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   8,
  },
  barLabel: {
    fontFamily:    MONO,
    fontSize:      10,
    letterSpacing: 3,
    color:         C.MID,
    fontWeight:    '700',
  },
  barPct: {
    fontFamily:    MONO,
    fontSize:      14,
    fontWeight:    '900',
    letterSpacing: 1,
  },
  barTrackOuter: {
    height:         14,
    justifyContent: 'center',
  },
  barTrackBg: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.BORDER,
  },
  barGlow: {
    position:     'absolute',
    left:         0,
    height:       12,
    borderRadius: 6,
    opacity:      0.24,
  },
  barFill: {
    position:     'absolute',
    left:         0,
    height:       4,
    borderRadius: 2,
  },
  barDot: {
    position:     'absolute',
    width:        7,
    height:       7,
    borderRadius: 4,
    top:          3.5,
    marginLeft:   -3.5,
  },
  barSub: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.DIM,
    marginTop:     5,
  },

  syncBtn: {
    borderWidth:       1,
    borderRadius:      16,
    paddingVertical:   13,
    paddingHorizontal: 16,
    alignItems:        'center',
    backgroundColor:   '#060F06',
    shadowColor:       '#39FF14',
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.15,
    shadowRadius:      8,
    elevation:         4,
  },
  syncBtnText: {
    fontFamily:    MONO,
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 4,
    color:         C.NEON_G,
  },
  syncBtnSub: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 1,
    color:         C.MID,
    marginTop:     5,
    textAlign:     'center',
  },

  fab: {
    borderWidth:     1.5,
    borderRadius:    50,
    paddingVertical: 20,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#0A0A0F',
  },
  fabText: {
    fontFamily:    MONO,
    fontSize:      15,
    fontWeight:    '900',
    letterSpacing: 6,
  },
});
