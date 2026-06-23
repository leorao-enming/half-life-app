import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptimalWindows } from '../../components/OptimalWindows';
import { PredictiveChart } from '../../components/PredictiveChart';
import { SystemLog } from '../../components/SystemLog';
import { useBioStore, selectAllLogs } from '../../src/store/useBioStore';

// ── Render + fetch guard ──────────────────────────────────────────────────────
//
// hasFetched ensures any future data-fetch runs exactly once and never retriggers
// on re-renders. AnalyticsScreen itself has no async fetch right now, but the
// ref is wired up so adding one later cannot accidentally create a loop.
//
// Debug: '[analytics] render' logs only fire when AnalyticsScreen itself
// re-renders (child ticks, e.g. OptimalWindows → setNowMs, do NOT propagate
// upward). If this log spams continuously the parent layout has a loop.
//
// LOOP PREVENTION RULES enforced in this file:
//   ✅ No useState in AnalyticsScreen (child state never propagates up)
//   ✅ Single useEffect with empty [] dep — fires once on mount
//   ✅ No Date.now() inside any Zustand selector (done in store selectors)
//   ✅ No router.replace / global refresh
//   ✅ No HealthKit init on render
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Rect,
  Line,
  Text as SvgText,
  G,
} from 'react-native-svg';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  BG:      '#050505',
  BORDER:  '#1A1A1A',
  NEON_G:  '#39FF14',
  ELEC_B:  '#0FF0FC',
  BLOOD_R: '#FF073A',
  NEON_Y:  '#FFFF33',
  TEXT:    '#FFFFFF',
  MID:     '#555555',
  DIM:     '#2A2A2A',
} as const;

const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const IS_WEB = Platform.OS === 'web';
const WEB_BD: object = IS_WEB
  ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }
  : {};

// ── Weekly load helper ────────────────────────────────────────────────────────

type DayLoad = { day: string; load: number };

function buildWeeklyLoad(logs: ReturnType<typeof selectAllLogs>): DayLoad[] {
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const now = Date.now();

  return Array.from({ length: 7 }, (_, i) => {
    const msAgo    = (6 - i) * 86_400_000;
    const dayStart = now - msAgo - ((now - msAgo) % 86_400_000);
    const dayEnd   = dayStart + 86_400_000;

    const load = logs
      .filter((l) => l.substanceType === 'caffeine' && l.timestamp >= dayStart && l.timestamp < dayEnd)
      .reduce((sum, l) => sum + l.amountMg, 0);

    return { day: DAY_NAMES[new Date(dayStart).getDay()], load };
  });
}

const CORR_DATA = [
  { time: '00', sleep: 8,   caf: 0   },
  { time: '04', sleep: 7.5, caf: 0   },
  { time: '08', sleep: 0,   caf: 200 },
  { time: '12', sleep: 0,   caf: 280 },
  { time: '16', sleep: 0,   caf: 160 },
  { time: '20', sleep: 2,   caf: 80  },
  { time: '24', sleep: 6,   caf: 0   },
];

// ── SVG path helpers ──────────────────────────────────────────────────────────

function smoothLine(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1);
    d +=
      ` C ${cpx} ${pts[i - 1][1].toFixed(1)},` +
      ` ${cpx} ${pts[i][1].toFixed(1)},` +
      ` ${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
  }
  return d;
}

function smoothArea(pts: [number, number][], baseY: number): string {
  if (!pts.length) return '';
  const last  = pts[pts.length - 1];
  const first = pts[0];
  return (
    `${smoothLine(pts)}` +
    ` L ${last[0].toFixed(1)} ${baseY}` +
    ` L ${first[0].toFixed(1)} ${baseY} Z`
  );
}

// ── GlassCard ─────────────────────────────────────────────────────────────────
// BlurView removed — solid dark background enables native shadows on both
// iOS and Android without requiring overflow:hidden tricks.

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={[s.card, IS_WEB ? WEB_BD : {}]}>
      <View style={s.cardInner}>{children}</View>
    </View>
  );
}

// ── Weekly Caffeine Bar Chart ─────────────────────────────────────────────────

function WeeklyBarChart({ chartWidth, data }: { chartWidth: number; data: DayLoad[] }) {
  const CHART_H = 168;
  const PAD     = { top: 8, right: 8, bottom: 28, left: 30 };
  const plotW   = chartWidth - PAD.left - PAD.right;
  const plotH   = CHART_H - PAD.top - PAD.bottom;
  const maxLoad = Math.max(...data.map((d) => d.load), 1);
  const barStep = plotW / data.length;
  const barW    = barStep * 0.52;

  const gridFracs = [0.25, 0.5, 0.75, 1];

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="anlBarGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.ELEC_B} stopOpacity={0.9} />
          <Stop offset="1"   stopColor={C.ELEC_B} stopOpacity={0.25} />
        </SvgGradient>
      </Defs>

      {/* Horizontal grid */}
      {gridFracs.map((f) => {
        const y   = PAD.top + plotH * (1 - f);
        const val = Math.round(maxLoad * f);
        return (
          <G key={f}>
            <Line
              x1={PAD.left} y1={y}
              x2={chartWidth - PAD.right} y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <SvgText
              x={PAD.left - 4} y={y + 3}
              fill={C.MID} fontSize={7}
              textAnchor="end" fontFamily="monospace"
            >
              {val}
            </SvgText>
          </G>
        );
      })}

      {/* X axis baseline */}
      <Line
        x1={PAD.left} y1={PAD.top + plotH}
        x2={chartWidth - PAD.right} y2={PAD.top + plotH}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />

      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.load / maxLoad) * plotH;
        const x    = PAD.left + i * barStep + (barStep - barW) / 2;
        const y    = PAD.top + plotH - barH;
        return (
          <G key={d.day}>
            {/* Subtle glow behind bar */}
            <Rect
              x={x - 3} y={y - 2}
              width={barW + 6} height={barH + 2}
              fill={C.ELEC_B} opacity={0.07} rx={6}
            />
            {/* Bar */}
            <Rect
              x={x} y={y}
              width={barW} height={barH}
              fill="url(#anlBarGrad)" rx={4}
            />
            {/* Day label */}
            <SvgText
              x={x + barW / 2} y={CHART_H - 6}
              fill={C.MID} fontSize={8}
              textAnchor="middle" fontFamily="monospace"
            >
              {d.day}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Sleep vs Stimulants Area Chart ────────────────────────────────────────────

function CorrelationChart({ chartWidth }: { chartWidth: number }) {
  const CHART_H  = 168;
  const PAD      = { top: 8, right: 6, bottom: 28, left: 6 };
  const plotW    = chartWidth - PAD.left - PAD.right;
  const plotH    = CHART_H - PAD.top - PAD.bottom;
  const baseY    = PAD.top + plotH;
  const maxCaf   = 280;
  const maxSleep = 10;
  const step     = plotW / (CORR_DATA.length - 1);

  const cafPts: [number, number][] = CORR_DATA.map((d, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (d.caf / maxCaf) * plotH,
  ]);
  const sleepPts: [number, number][] = CORR_DATA.map((d, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (d.sleep / maxSleep) * plotH,
  ]);

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="anlCafGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.BLOOD_R} stopOpacity={0.35} />
          <Stop offset="0.6" stopColor={C.BLOOD_R} stopOpacity={0.07} />
          <Stop offset="1"   stopColor={C.BLOOD_R} stopOpacity={0}    />
        </SvgGradient>
        <SvgGradient id="anlSlpGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.NEON_G} stopOpacity={0.40} />
          <Stop offset="0.6" stopColor={C.NEON_G} stopOpacity={0.08} />
          <Stop offset="1"   stopColor={C.NEON_G} stopOpacity={0}    />
        </SvgGradient>
      </Defs>

      {/* Grid */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <Line
          key={f}
          x1={PAD.left} y1={PAD.top + plotH * (1 - f)}
          x2={chartWidth - PAD.right} y2={PAD.top + plotH * (1 - f)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {/* Baseline */}
      <Line
        x1={PAD.left} y1={baseY}
        x2={chartWidth - PAD.right} y2={baseY}
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={1}
      />

      {/* Caffeine area */}
      <Path d={smoothArea(cafPts, baseY)} fill="url(#anlCafGrad)" />
      <Path d={smoothLine(cafPts)} stroke={C.BLOOD_R} strokeWidth={2} fill="none" />

      {/* Sleep area */}
      <Path d={smoothArea(sleepPts, baseY)} fill="url(#anlSlpGrad)" />
      <Path d={smoothLine(sleepPts)} stroke={C.NEON_G} strokeWidth={2} fill="none" />

      {/* Time labels every other point */}
      {CORR_DATA.map((d, i) =>
        i % 2 === 0 ? (
          <SvgText
            key={d.time}
            x={PAD.left + i * step} y={CHART_H - 6}
            fill={C.MID} fontSize={8}
            textAnchor="middle" fontFamily="monospace"
          >
            {d.time}h
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

// ── Summary stat tile ─────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  color: string;
  accentColor: string;
}

function StatTile({ label, value, color, accentColor }: StatTileProps) {
  return (
    <View style={[s.statTile, { borderColor: `${accentColor}18` }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Analytics screen ──────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  // ── Debug: render counter (dev-only, silent in prod) ─────────────────────
  const renderCountRef = useRef(0);
  if (__DEV__) {
    renderCountRef.current += 1;
    console.log(`[analytics] render #${renderCountRef.current}`);
  }

  // ── One-time fetch guard (no fetch yet, wired for future use) ─────────────
  // Pattern: if (hasFetched.current) return; hasFetched.current = true; fetch()
  const hasFetched = useRef(false);
  void hasFetched; // silence unused-var lint until first fetch is added

  const insets      = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  // Inner chart width: screen − horizontal padding (20×2) − card inner padding (16×2)
  const chartWidth = W - 20 * 2 - 16 * 2;

  // Live store data — selector is stable, no Date.now() risk, not useState
  const logs       = useBioStore(selectAllLogs);
  const weeklyData = React.useMemo(() => buildWeeklyLoad(logs), [logs]);

  const screenAnim = useRef(new Animated.Value(0)).current;

  // Empty dep array → runs exactly once on mount.
  // screenAnim is a stable Animated.Value (useRef.current never changes),
  // so listing it as a dep is equivalent but [] is clearer about intent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    console.log('[analytics] entrance animation start');
    Animated.timing(screenAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start(() => {
      console.log('[analytics] entrance animation end');
    });
  }, []);

  return (
    <View style={s.root}>
      {/* Subtle top gradient */}
      <LinearGradient
        colors={['#0A0A1A', '#050505']}
        locations={[0, 0.5]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ─────────────────────────────────────────────── */}
        <Animated.View style={[s.titleBlock, { opacity: screenAnim }]}>
          <Text style={s.eyebrow}>ANALYTICAL OVERVIEW</Text>
          <Text style={s.pageTitle}>PERFORMANCE{'\n'}METRICS</Text>
        </Animated.View>

        {/* ── Readiness Windows (live store data) ────────────────────── */}
        <Text style={s.sectionLabel}>▸  READINESS WINDOWS</Text>
        <View style={s.negativeMargin}>
          <OptimalWindows />
        </View>

        {/* ── 12-Hour Metabolic Forecast ─────────────────────────────── */}
        <Text style={[s.sectionLabel, s.sectionGap]}>▸  12-HOUR FORECAST</Text>
        <View style={s.negativeMargin}>
          <PredictiveChart />
        </View>

        {/* ── Weekly Load chart ──────────────────────────────────────── */}
        <Text style={[s.sectionLabel, s.sectionGap]}>▸  WEEKLY CAFFEINE LOAD</Text>
        <GlassCard>
          <Text style={s.cardSubtitle}>TOTAL MG INTAKE PER DAY</Text>
          <WeeklyBarChart chartWidth={chartWidth} data={weeklyData} />
        </GlassCard>

        {/* ── Sleep vs Stimulants chart ──────────────────────────────── */}
        <Text style={[s.sectionLabel, s.sectionGap]}>▸  SLEEP VS STIMULANTS</Text>
        <GlassCard>
          <Text style={s.cardSubtitle}>24-HOUR CORRELATION PATTERN</Text>
          <CorrelationChart chartWidth={chartWidth} />
          {/* Legend */}
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.NEON_G }]} />
              <Text style={s.legendLabel}>SLEEP HRS</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.BLOOD_R }]} />
              <Text style={s.legendLabel}>CAFFEINE MG</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Stats grid ─────────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, s.sectionGap]}>▸  SUMMARY STATS</Text>
        <View style={s.statsGrid}>
          <StatTile label="AVG DAILY LOAD"  value="272mg"   color={C.ELEC_B}  accentColor={C.ELEC_B}  />
          <StatTile label="PEAK TIME"        value="14:30"   color={C.NEON_Y}  accentColor={C.NEON_Y}  />
          <StatTile label="WEEKLY TOTAL"     value="1,900mg" color={C.NEON_G}  accentColor={C.NEON_G}  />
          <StatTile label="AVG SLEEP"        value="6.4h"    color={C.BLOOD_R} accentColor={C.BLOOD_R} />
        </View>

        {/* ── Recent Activity ────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, s.sectionGap]}>▸  RECENT ACTIVITY</Text>
        <View style={s.negativeMargin}>
          <SystemLog />
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.BG,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Title
  titleBlock: {
    marginBottom: 28,
  },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    color: C.MID,
    marginBottom: 5,
  },
  pageTitle: {
    fontFamily: MONO,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    color: C.ELEC_B,
    lineHeight: 32,
  },

  // Section label
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    color: C.MID,
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionGap: {
    marginTop: 24,
  },

  // Glass card — solid dark background required for iOS/Android shadows
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0C0C0C',
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  cardInner: {
    padding: 16,
    paddingBottom: 14,
  },
  cardSubtitle: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 3,
    color: C.MID,
    marginBottom: 14,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.MID,
  },

  // Negative margin to cancel out scrollContent's paddingHorizontal for full-width components
  negativeMargin: {
    marginHorizontal: -20,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 16,
  },
  statLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 3,
    color: C.MID,
    marginBottom: 10,
  },
  statValue: {
    fontFamily: MONO,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
