// =============================================================================
// app/(tabs)/index.tsx — NOW
// The home screen. Answers in one glance: what's my state right now, when can
// I sleep, and gives a zero-friction way to log. Energy/performance framing.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Line } from 'react-native-svg';

import {
  selectAllLogs,
  selectCafFactor,
  selectSodiumFactor,
  selectHealthKitMultiplier,
  selectOfflineQueueCount,
  computeActiveCaffeine,
  useBioStore,
} from '../../src/store/useBioStore';
import { generateForecast } from '../../src/utils/kinetics';
import {
  classifyEnergyState,
  effectiveCaffeineHalfLife,
  clearanceSecs,
  sleepReadyAt,
  fmtClock,
} from '../../src/utils/energyState';
import { color, font, type as T, space, tracking, alpha } from '../../src/theme/tokens';

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_DOSE_MG   = 95;     // a standard cup of drip coffee
const SODIUM_LIMIT_MG = 2_300;  // FDA daily ceiling

// ─── Env check (logged once) ──────────────────────────────────────────────────
console.log(
  '[now] EXPO_PUBLIC_SUPABASE_URL:',
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '⚠ MISSING — add to .env and restart dev server',
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  return h > 0 ? `${h}H ${m}M` : `${m}M`;
}

function smoothLine(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1);
    d += ` C ${cpx} ${pts[i - 1][1].toFixed(1)}, ${cpx} ${pts[i][1].toFixed(1)}, ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return d;
}

function smoothArea(pts: [number, number][], baseY: number): string {
  if (!pts.length) return '';
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${smoothLine(pts)} L ${last[0].toFixed(1)} ${baseY} L ${first[0].toFixed(1)} ${baseY} Z`;
}

// ─── Caffeine decay curve (mini) ──────────────────────────────────────────────

function DecayCurve({ width, series, stroke }: { width: number; series: number[]; stroke: string }) {
  const H    = 72;
  const padX = 2;
  const padY = 6;
  const plotW = width - padX * 2;
  const plotH = H - padY * 2;
  const max   = Math.max(...series, 1);
  const step  = plotW / Math.max(series.length - 1, 1);

  const pts: [number, number][] = series.map((v, i) => [
    padX + i * step,
    padY + plotH - (v / max) * plotH,
  ]);

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgGradient id="nowCafGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={stroke} stopOpacity={0.28} />
          <Stop offset="0.7" stopColor={stroke} stopOpacity={0.05} />
          <Stop offset="1"   stopColor={stroke} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Line x1={padX} y1={H - padY} x2={width - padX} y2={H - padY} stroke={alpha(color.text, 0.05)} strokeWidth={1} />
      <Path d={smoothArea(pts, H - padY)} fill="url(#nowCafGrad)" />
      <Path d={smoothLine(pts)} stroke={stroke} strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ─── Sync indicator ───────────────────────────────────────────────────────────

function SyncIndicator() {
  const queueCount = useBioStore((s) => selectOfflineQueueCount(s));
  const syncStatus = useBioStore((s) => s.syncStatus);
  if (queueCount === 0 && syncStatus !== 'error') return null;

  const c     = syncStatus === 'error' ? color.alert : color.energy;
  const label = syncStatus === 'error' ? 'SYNC ERROR' : `${queueCount} PENDING`;
  return (
    <View style={[s.syncBadge, { borderColor: alpha(c, 0.27), backgroundColor: alpha(c, 0.06) }]}>
      <Text style={[s.syncBadgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ─── Secondary tile ───────────────────────────────────────────────────────────

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <View style={[s.tile, { borderColor: alpha(accent, 0.18) }]}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, { color: accent }]}>{value}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </View>
  );
}

// ─── NOW screen ───────────────────────────────────────────────────────────────

export default function Now() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const curveWidth = screenW - space.xl * 2 - space.lg * 2;

  // Raw store data — stable selectors, no Date.now() inside
  const logs          = useBioStore(selectAllLogs);
  const cafFactor     = useBioStore(selectCafFactor);
  const sodiumFactor  = useBioStore(selectSodiumFactor);
  const healthKitMult = useBioStore(selectHealthKitMultiplier);
  const supabaseUserId = useBioStore((st) => st.supabaseUserId);

  // nowMs ticks every second; drives all time-based computations
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const hasCaf  = useMemo(() => logs.some((l) => l.substanceType === 'caffeine'), [logs]);
  const isEmpty = logs.length === 0;

  const activeCaf = useMemo(
    () => computeActiveCaffeine(logs, cafFactor, healthKitMult, nowMs),
    [logs, cafFactor, healthKitMult, nowMs],
  );
  const halfLife  = useMemo(() => effectiveCaffeineHalfLife(cafFactor, healthKitMult), [cafFactor, healthKitMult]);
  const state     = classifyEnergyState(activeCaf);
  const readyAtMs = useMemo(() => sleepReadyAt(activeCaf, halfLife, nowMs), [activeCaf, halfLife, nowMs]);
  const secsLeft  = useMemo(() => clearanceSecs(activeCaf, halfLife), [activeCaf, halfLife]);

  // Caffeine forecast curve (12h)
  const cafSeries = useMemo(
    () => generateForecast(logs, cafFactor, healthKitMult, nowMs).map((p) => p.caffeine),
    [logs, cafFactor, healthKitMult, nowMs],
  );

  // Energy window (sugar) — honest rough gauge, NOT exponential decay
  const sugarWindow = useMemo(() => {
    const sugar = logs.filter((l) => l.substanceType === 'sugar');
    if (!sugar.length) return null;
    const mins = (nowMs - Math.max(...sugar.map((l) => l.timestamp))) / 60_000;
    if (mins > 120) return null;
    if (mins < 45)  return { label: 'PEAK',   sub: `${Math.round(mins)}M IN` };
    if (mins < 90)  return { label: 'FADING', sub: `${Math.round(mins)}M IN` };
    return                 { label: 'LOW',    sub: `${Math.round(mins)}M IN` };
  }, [logs, nowMs]);

  // Sodium today — simple cumulative daily total, no half-life claim
  const sodiumTodayMg = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const m0 = midnight.getTime();
    return logs
      .filter((l) => l.substanceType === 'sodium' && l.timestamp >= m0)
      .reduce((sum, l) => sum + l.amountMg, 0);
  }, [logs, nowMs]);

  // Entrance animation
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  // BioState haptic on threshold crossings
  const prevKeyRef = useRef(state.key);
  useEffect(() => {
    if (state.key !== prevKeyRef.current) {
      if (state.key === 'PEAK')        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else if (state.key === 'CLEAR' && hasCaf) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      prevKeyRef.current = state.key;
    }
  }, [state.key, hasCaf]);

  // Quick-log a standard coffee — zero-friction logging
  const onQuickLog = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useBioStore.getState().addLog({
      label:         'COFFEE',
      substanceType: 'caffeine',
      amountMg:      QUICK_DOSE_MG,
      timestamp:     Date.now(),
    });
  }, []);

  const onCustomLog = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/inject');
  }, []);

  const dateStr = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase();

  const supabaseConfigured = !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
  const authLabel = !supabaseConfigured
    ? '⚠  SUPABASE ENV VARS MISSING'
    : supabaseUserId ? 'SYNCED' : 'GUEST MODE';
  const authColor = !supabaseConfigured ? color.energy : supabaseUserId ? color.ready : color.textMid;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <Text style={s.wordmark}>HALF-LIFE</Text>
          <View style={s.topBarRight}>
            <SyncIndicator />
            <Text style={s.date}>{dateStr}</Text>
            <View style={[s.liveDot, { backgroundColor: state.color, shadowColor: state.color }]} />
          </View>
        </View>
        <Text style={[s.authLabel, { color: authColor }]}>{'•'}  {authLabel}</Text>

        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
          {/* ── Hero: energy state ─────────────────────────────────────── */}
          <View style={s.hero}>
            <Text style={s.eyebrow}>CURRENT STATE</Text>
            {isEmpty ? (
              <>
                <Text style={[s.stateHeadline, { color: color.text }]}>WELCOME</Text>
                <Text style={s.heroSub}>LOG YOUR FIRST COFFEE TO SEE YOUR STATE</Text>
              </>
            ) : (
              <>
                <Text style={[s.stateHeadline, { color: state.color, textShadowColor: alpha(state.color, 0.5) }]}>
                  {state.label}
                </Text>
                <Text style={s.heroSub}>
                  {hasCaf
                    ? `${Math.round(activeCaf)} MG ACTIVE CAFFEINE`
                    : 'NO CAFFEINE ACTIVE'}
                </Text>
              </>
            )}
          </View>

          {/* ── Sleep-ready (hero feature) ─────────────────────────────── */}
          <View style={s.sleepCard}>
            <View>
              <Text style={s.sleepLabel}>SLEEP-READY</Text>
              <Text style={s.sleepSub}>CAFFEINE BELOW 5 MG</Text>
            </View>
            <View style={s.sleepRight}>
              {readyAtMs ? (
                <>
                  <Text style={[s.sleepValue, { color: color.primary }]}>{fmtClock(readyAtMs)}</Text>
                  <Text style={s.sleepRel}>≈ {fmtDuration(secsLeft)}</Text>
                </>
              ) : (
                <Text style={[s.sleepValue, { color: color.ready }]}>NOW</Text>
              )}
            </View>
          </View>

          {/* ── Decay curve ────────────────────────────────────────────── */}
          {hasCaf && (
            <View style={s.curveCard}>
              <Text style={s.curveLabel}>▸  CAFFEINE · NEXT 12H</Text>
              <DecayCurve width={curveWidth} series={cafSeries} stroke={state.color} />
            </View>
          )}

          {/* ── Quick log ──────────────────────────────────────────────── */}
          <Pressable
            onPress={onQuickLog}
            onPressIn={() => void Haptics.selectionAsync()}
            accessibilityRole="button"
            accessibilityLabel="Log a coffee"
            style={({ pressed }) => [
              s.quickBtn,
              { borderColor: color.primary, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={s.quickBtnText}>+  LOG COFFEE</Text>
            <Text style={s.quickBtnDose}>{QUICK_DOSE_MG} MG</Text>
          </Pressable>

          <Pressable onPress={onCustomLog} accessibilityRole="button" accessibilityLabel="Log something else">
            <Text style={s.customLink}>LOG SOMETHING ELSE  →</Text>
          </Pressable>

          {/* ── Secondary tiles ────────────────────────────────────────── */}
          <View style={s.tileRow}>
            <Tile
              label="ENERGY WINDOW"
              value={sugarWindow ? sugarWindow.label : '—'}
              sub={sugarWindow ? sugarWindow.sub : 'NO RECENT SUGAR'}
              accent={color.energy}
            />
            <Tile
              label="SODIUM TODAY"
              value={`${Math.round(sodiumTodayMg)}`}
              sub={`/ ${SODIUM_LIMIT_MG} MG`}
              accent={color.sodium}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.md },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: {
    fontFamily: font.mono, fontSize: T.label, letterSpacing: 8,
    color: color.textDim, fontWeight: '700',
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  date: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.textMid },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.95, shadowRadius: 8, elevation: 6,
  },
  authLabel: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, marginTop: space.sm },

  syncBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: space.sm, paddingVertical: 2 },
  syncBadgeText: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, fontWeight: '700' },

  // Hero
  hero: { alignItems: 'center', marginTop: space.xxxl, marginBottom: space.xl },
  eyebrow: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.wide, color: color.textMid, marginBottom: space.sm },
  stateHeadline: {
    fontFamily: font.mono, fontSize: 34, fontWeight: '900', letterSpacing: 3,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  heroSub: { fontFamily: font.mono, fontSize: T.body, letterSpacing: tracking.label, color: color.textMid, marginTop: space.sm },

  // Sleep card
  sleepCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: color.surface, borderRadius: 18, borderWidth: 1, borderColor: color.border,
    paddingHorizontal: space.xl, paddingVertical: space.lg, marginBottom: space.md,
  },
  sleepLabel: { fontFamily: font.mono, fontSize: T.body, fontWeight: '700', letterSpacing: tracking.label, color: color.text },
  sleepSub:   { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginTop: space.xs },
  sleepRight: { alignItems: 'flex-end' },
  sleepValue: { fontFamily: font.mono, fontSize: T.display, fontWeight: '900', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  sleepRel:   { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginTop: 2 },

  // Curve
  curveCard: {
    backgroundColor: color.surface, borderRadius: 18, borderWidth: 1, borderColor: color.border,
    padding: space.lg, marginBottom: space.lg,
  },
  curveLabel: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginBottom: space.sm },

  // Quick log
  quickBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: space.md,
    borderWidth: 1.5, borderRadius: 16, paddingVertical: 18,
    backgroundColor: alpha(color.primary, 0.06),
    shadowColor: color.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  quickBtnText: { fontFamily: font.mono, fontSize: T.h2, fontWeight: '900', letterSpacing: tracking.wide, color: color.primary },
  quickBtnDose: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: alpha(color.primary, 0.6) },
  customLink: {
    fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.textMid,
    textAlign: 'center', marginTop: space.md, marginBottom: space.xl,
  },

  // Tiles
  tileRow: { flexDirection: 'row', gap: space.md },
  tile: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    backgroundColor: color.surface, padding: space.lg,
  },
  tileLabel: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginBottom: space.sm },
  tileValue: { fontFamily: font.mono, fontSize: T.h1, fontWeight: '900', letterSpacing: 1 },
  tileSub:   { fontFamily: font.mono, fontSize: T.micro, letterSpacing: 1, color: color.textDim, marginTop: space.xs },
});
