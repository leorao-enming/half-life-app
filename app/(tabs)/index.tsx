// =============================================================================
// app/(tabs)/index.tsx — NOW
// One-glance answer: current energy state, when can I sleep, one-tap log.
// Aesthetic: luxury instrument — one element glows, everything else retreats.
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
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Line,
  Text as SvgText,
} from 'react-native-svg';

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

const QUICK_DOSE_MG   = 95;      // standard drip coffee
const SODIUM_LIMIT_MG = 2_300;   // FDA daily ceiling
const CAF_MAX_RING    = 400;     // 400 mg = full ring arc

// ─── SVG ring geometry ────────────────────────────────────────────────────────
// 280° arc, gap centred at the bottom (6 o'clock).
// START at 220° from 12 o'clock clockwise ≈ bottom-left (7:20).
// END   at 140° from 12 o'clock clockwise ≈ bottom-right (4:40).

const RS        = 220;   // ring canvas size
const RR        = 88;    // ring radius
const RC        = RS / 2; // centre x & y
const R_START   = 220;   // start angle (degrees from 12 o'clock, clockwise)
const R_SWEEP   = 280;   // total arc degrees

function polarPt(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: +(RC + r * Math.cos(rad)).toFixed(2), y: +(RC + r * Math.sin(rad)).toFixed(2) };
}

function arcPath(r: number, startDeg: number, sweepDeg: number): string {
  if (sweepDeg < 0.5) return '';
  const s = polarPt(r, startDeg);
  const e = polarPt(r, startDeg + Math.min(sweepDeg, 359.9));
  return `M${s.x} ${s.y} A${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

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
  return `${smoothLine(pts)} L ${last[0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;
}

// ─── Ring hero ────────────────────────────────────────────────────────────────

interface RingHeroProps {
  activeCaf: number;
  state:     { color: string; label: string; key: string };
  isEmpty:   boolean;
}

function RingHero({ activeCaf, state, isEmpty }: RingHeroProps) {
  const pct  = isEmpty ? 0 : Math.min(activeCaf / CAF_MAX_RING, 1);
  const fill = pct * R_SWEEP;

  return (
    <View style={rs.wrap}>
      <Svg width={RS} height={RS}>
        {/* Outer track */}
        <Path
          d={arcPath(RR, R_START, R_SWEEP)}
          stroke={alpha(color.text, 0.05)}
          strokeWidth={1.5}
          fill="none"
          strokeLinecap="round"
        />
        {/* Inner accent track — a second fine ring for depth */}
        <Path
          d={arcPath(RR - 10, R_START, R_SWEEP)}
          stroke={alpha(color.text, 0.02)}
          strokeWidth={0.5}
          fill="none"
          strokeLinecap="round"
        />
        {/* Active fill */}
        {fill > 0.5 && (
          <Path
            d={arcPath(RR, R_START, fill)}
            stroke={state.color}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </Svg>

      {/* Centre overlay — absolutely positioned over SVG */}
      <View style={rs.centre}>
        {isEmpty ? (
          <Text style={rs.emptyHint}>LOG TO START</Text>
        ) : (
          <>
            <Text style={rs.cafNum}>{Math.round(activeCaf)}</Text>
            <Text style={rs.cafUnit}>MG CAFFEINE</Text>
            <Text style={[rs.stateTag, { color: alpha(state.color, 0.85) }]}>
              {state.label}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    width: RS, height: RS,
    alignItems: 'center', justifyContent: 'center',
  },
  centre: {
    position: 'absolute',
    width: RS, height: RS,
    alignItems: 'center', justifyContent: 'center',
  },
  cafNum: {
    fontSize:      T.display,
    fontWeight:    '100',       // ultra-thin — the watch-hand move
    color:         color.text,
    letterSpacing: -1,
    fontVariant:   ['tabular-nums'] as const,
    lineHeight:    60,
  },
  cafUnit: {
    fontFamily:    font.mono,
    fontSize:      7,
    color:         color.textMid,
    letterSpacing: tracking.label,
    marginTop:     6,
  },
  stateTag: {
    fontFamily:    font.mono,
    fontSize:      7,
    letterSpacing: tracking.label,
    marginTop:     8,
    fontWeight:    '500',
  },
  emptyHint: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    color:         color.textDim,
    letterSpacing: tracking.label,
  },
});

// ─── Instrument decay curve ───────────────────────────────────────────────────

function DecayCurve({ width, series, stroke }: { width: number; series: number[]; stroke: string }) {
  const H     = 80;
  const padX  = 2;
  const padY  = 8;
  const plotW = width - padX * 2;
  const plotH = H - padY * 2;
  const max   = Math.max(...series, 10);
  const step  = plotW / Math.max(series.length - 1, 1);

  const pts: [number, number][] = series.map((v, i) => [
    padX + i * step,
    padY + plotH - (v / max) * plotH,
  ]);

  // Y position for the 5 mg sleep-ready threshold
  const threshY = padY + plotH - (5 / max) * plotH;
  const showThresh = max > 8 && threshY > padY + 4 && threshY < H - padY;

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgGradient id="lxCafGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={stroke} stopOpacity={0.07} />
          <Stop offset="1"   stopColor={stroke} stopOpacity={0}    />
        </SvgGradient>
      </Defs>

      {/* Baseline */}
      <Line
        x1={padX} y1={H - padY}
        x2={width - padX} y2={H - padY}
        stroke={alpha(color.text, 0.04)} strokeWidth={0.5}
      />

      {/* 5 mg sleep threshold */}
      {showThresh && (
        <>
          <Line
            x1={padX} y1={threshY}
            x2={width - padX} y2={threshY}
            stroke={alpha(color.ready, 0.30)}
            strokeWidth={0.5}
            strokeDasharray="3 5"
          />
          <SvgText
            x={width - padX}
            y={threshY - 3}
            fill={alpha(color.ready, 0.45)}
            fontSize={6}
            textAnchor="end"
            fontFamily={font.mono}
          >SLEEP</SvgText>
        </>
      )}

      {/* Area fill — barely there */}
      <Path d={smoothArea(pts, H - padY)} fill="url(#lxCafGrad)" />
      {/* Line — thin, precise */}
      <Path d={smoothLine(pts)} stroke={stroke} strokeWidth={1} fill="none" />
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
    <View style={[s.syncBadge, { borderColor: alpha(c, 0.20), backgroundColor: alpha(c, 0.05) }]}>
      <Text style={[s.syncBadgeText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ─── Secondary tile ───────────────────────────────────────────────────────────

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <View style={[s.tile, { borderColor: alpha(accent, 0.12) }]}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, { color: alpha(accent, 0.9) }]}>{value}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </View>
  );
}

// ─── NOW screen ───────────────────────────────────────────────────────────────

console.log(
  '[now] EXPO_PUBLIC_SUPABASE_URL:',
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '⚠ MISSING',
);

export default function Now() {
  const insets    = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const curveW    = width - space.xl * 2 - space.lg * 2;

  const logs          = useBioStore(selectAllLogs);
  const cafFactor     = useBioStore(selectCafFactor);
  const sodiumFactor  = useBioStore(selectSodiumFactor);
  const healthKitMult = useBioStore(selectHealthKitMultiplier);
  const supabaseUserId = useBioStore((st) => st.supabaseUserId);

  // nowMs ticks every second — drives all time-based computations.
  // NEVER call Date.now() inside a selector: causes infinite re-render.
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
  const readyAtMs = useMemo(() => sleepReadyAt(activeCaf, halfLife, nowMs),  [activeCaf, halfLife, nowMs]);
  const secsLeft  = useMemo(() => clearanceSecs(activeCaf, halfLife),         [activeCaf, halfLife]);

  const cafSeries = useMemo(
    () => generateForecast(logs, cafFactor, healthKitMult, nowMs).map((p) => p.caffeine),
    [logs, cafFactor, healthKitMult, nowMs],
  );

  // Sugar: recency gauge — not exponential decay
  const sugarWindow = useMemo(() => {
    const sugar = logs.filter((l) => l.substanceType === 'sugar');
    if (!sugar.length) return null;
    const mins = (nowMs - Math.max(...sugar.map((l) => l.timestamp))) / 60_000;
    if (mins > 120) return null;
    if (mins < 45)  return { label: 'PEAK',   sub: `${Math.round(mins)}M AGO` };
    if (mins < 90)  return { label: 'FADING', sub: `${Math.round(mins)}M AGO` };
    return                 { label: 'LOW',    sub: `${Math.round(mins)}M AGO` };
  }, [logs, nowMs]);

  // Sodium: simple daily cumulative
  const sodiumTodayMg = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    return logs
      .filter((l) => l.substanceType === 'sodium' && l.timestamp >= midnight.getTime())
      .reduce((sum, l) => sum + l.amountMg, 0);
  }, [logs, nowMs]);

  // Entrance animation
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  // Haptic on energy state threshold crossings
  const prevKeyRef = useRef(state.key);
  useEffect(() => {
    if (state.key !== prevKeyRef.current) {
      if (state.key === 'PEAK')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else if (state.key === 'CLEAR' && hasCaf)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      prevKeyRef.current = state.key;
    }
  }, [state.key, hasCaf]);

  const onQuickLog = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useBioStore.getState().addLog({
      label: 'COFFEE', substanceType: 'caffeine',
      amountMg: QUICK_DOSE_MG, timestamp: Date.now(),
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
  const authColor = !supabaseConfigured
    ? color.energy
    : supabaseUserId ? color.ready : color.textMid;
  const authLabel = !supabaseConfigured
    ? 'SUPABASE NOT CONFIGURED'
    : supabaseUserId ? 'SYNCED' : 'GUEST';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <Text style={s.wordmark}>HALF·LIFE</Text>
          <View style={s.topRight}>
            <SyncIndicator />
            <Text style={s.date}>{dateStr}</Text>
            <View style={[s.liveDot, { backgroundColor: state.color }]} />
          </View>
        </View>

        <Text style={[s.authLine, { color: alpha(authColor, 0.55) }]}>{authLabel}</Text>

        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>

          {/* ── Ring hero ─────────────────────────────────────────────── */}
          <View style={s.ringSection}>
            <RingHero activeCaf={activeCaf} state={state} isEmpty={isEmpty} />
            {isEmpty && (
              <Text style={s.emptyInvite}>
                LOG YOUR FIRST COFFEE{'\n'}TO SEE YOUR STATE
              </Text>
            )}
          </View>

          {/* ── Sleep-ready card ──────────────────────────────────────── */}
          <View style={s.sleepCard}>
            <View>
              <Text style={s.sleepLabel}>SLEEP-READY</Text>
              <Text style={s.sleepSub}>caffeine below 5 mg</Text>
            </View>
            <View style={s.sleepRight}>
              {readyAtMs ? (
                <>
                  <Text style={[s.sleepTime, { color: color.primary }]}>{fmtClock(readyAtMs)}</Text>
                  <Text style={s.sleepRel}>≈ {fmtDuration(secsLeft)}</Text>
                </>
              ) : (
                <Text style={[s.sleepTime, { color: color.ready }]}>NOW</Text>
              )}
            </View>
          </View>

          {/* ── Decay curve ───────────────────────────────────────────── */}
          {hasCaf && (
            <View style={s.curveCard}>
              <Text style={s.curveLabel}>CAFFEINE  ·  NEXT 12H</Text>
              <DecayCurve width={curveW} series={cafSeries} stroke={state.color} />
            </View>
          )}

          {/* ── Quick log ─────────────────────────────────────────────── */}
          <Pressable
            onPress={onQuickLog}
            onPressIn={() => void Haptics.selectionAsync()}
            accessibilityRole="button"
            accessibilityLabel="Log a coffee"
            style={({ pressed }) => [s.logBtn, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Text style={s.logBtnText}>LOG COFFEE</Text>
            <Text style={s.logBtnDose}>· {QUICK_DOSE_MG} MG</Text>
          </Pressable>

          <Pressable
            onPress={onCustomLog}
            accessibilityRole="button"
            accessibilityLabel="Log something else"
          >
            <Text style={s.moreLink}>LOG SOMETHING ELSE  →</Text>
          </Pressable>

          {/* ── Secondary tiles ───────────────────────────────────────── */}
          <View style={s.tileRow}>
            <Tile
              label="ENERGY WINDOW"
              value={sugarWindow ? sugarWindow.label : '—'}
              sub={sugarWindow ? sugarWindow.sub : 'no recent sugar'}
              accent={color.energy}
            />
            <Tile
              label="SODIUM TODAY"
              value={`${Math.round(sodiumTodayMg)}`}
              sub={`/ ${SODIUM_LIMIT_MG} mg`}
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

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 2,
  },
  wordmark: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: 6,
    color:         color.textDim,
    fontWeight:    '400',
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  date:     {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.label,
    color:         color.textMid,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: 3,
    opacity: 0.85,
  },
  authLine: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.label,
    marginBottom:  space.sm,
  },
  syncBadge: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: space.sm, paddingVertical: 2,
  },
  syncBadgeText: {
    fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, fontWeight: '600',
  },

  // Ring section
  ringSection: { alignItems: 'center', marginTop: space.xl, marginBottom: space.xl },
  emptyInvite: {
    fontFamily:    font.mono,
    fontSize:      T.label,
    letterSpacing: tracking.label,
    color:         color.textMid,
    textAlign:     'center',
    marginTop:     space.sm,
    lineHeight:    16,
  },

  // Sleep card
  sleepCard: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    backgroundColor: color.surface,
    borderRadius:    20,
    borderWidth:     0.5,
    borderColor:     color.border,
    paddingHorizontal: space.xl,
    paddingVertical:   space.lg,
    marginBottom:    space.md,
  },
  sleepLabel: {
    fontFamily:    font.mono,
    fontSize:      T.label,
    fontWeight:    '600',
    letterSpacing: tracking.label,
    color:         color.text,
  },
  sleepSub: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.tight,
    color:         color.textMid,
    marginTop:     space.xs,
  },
  sleepRight: { alignItems: 'flex-end' },
  sleepTime: {
    fontFamily:    font.mono,
    fontSize:      28,
    fontWeight:    '200',
    letterSpacing: 0,
    fontVariant:   ['tabular-nums'] as const,
  },
  sleepRel: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.label,
    color:         color.textMid,
    marginTop:     2,
  },

  // Curve card
  curveCard: {
    backgroundColor: color.surface,
    borderRadius:    20,
    borderWidth:     0.5,
    borderColor:     color.border,
    padding:         space.lg,
    marginBottom:    space.lg,
  },
  curveLabel: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.label,
    color:         color.textMid,
    marginBottom:  space.sm,
  },

  // Log button
  logBtn: {
    flexDirection:   'row',
    justifyContent:  'center',
    alignItems:      'baseline',
    gap:             space.sm,
    borderWidth:     0.5,
    borderRadius:    18,
    borderColor:     alpha(color.primary, 0.25),
    paddingVertical: 18,
    backgroundColor: alpha(color.primary, 0.04),
  },
  logBtnText: {
    fontFamily:    font.mono,
    fontSize:      T.h2,
    fontWeight:    '500',
    letterSpacing: tracking.wide,
    color:         color.primary,
  },
  logBtnDose: {
    fontFamily:    font.mono,
    fontSize:      T.label,
    letterSpacing: tracking.label,
    color:         alpha(color.primary, 0.45),
  },
  moreLink: {
    fontFamily:    font.mono,
    fontSize:      T.label,
    letterSpacing: tracking.label,
    color:         color.textMid,
    textAlign:     'center',
    marginTop:     space.md,
    marginBottom:  space.xl,
  },

  // Tiles
  tileRow: { flexDirection: 'row', gap: space.md },
  tile: {
    flex:            1,
    borderRadius:    16,
    borderWidth:     0.5,
    backgroundColor: color.surface,
    padding:         space.lg,
  },
  tileLabel: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.label,
    color:         color.textMid,
    marginBottom:  space.sm,
  },
  tileValue: {
    fontFamily:    font.mono,
    fontSize:      T.h1,
    fontWeight:    '300',
    letterSpacing: 0,
    fontVariant:   ['tabular-nums'] as const,
  },
  tileSub: {
    fontFamily:    font.mono,
    fontSize:      T.micro,
    letterSpacing: tracking.tight,
    color:         color.textDim,
    marginTop:     space.xs,
  },
});
