// =============================================================================
// app/(tabs)/analytics.tsx — TRENDS
// Real, honest analytics computed from logged data. No hardcoded metrics.
// =============================================================================

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { OptimalWindows } from '../../components/OptimalWindows';
import { PredictiveChart } from '../../components/PredictiveChart';
import { SystemLog } from '../../components/SystemLog';
import { useBioStore, selectAllLogs } from '../../src/store/useBioStore';
import { color, font, type as T, space, tracking, alpha } from '../../src/theme/tokens';

const DAY_MS = 86_400_000;

// ── Derived analytics (pure, from logs) ───────────────────────────────────────

type DayLoad = { day: string; load: number };

function buildWeeklyLoad(logs: ReturnType<typeof selectAllLogs>): DayLoad[] {
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const now = Date.now();
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * DAY_MS - ((now - (6 - i) * DAY_MS) % DAY_MS);
    const dayEnd   = dayStart + DAY_MS;
    const load = logs
      .filter((l) => l.substanceType === 'caffeine' && l.timestamp >= dayStart && l.timestamp < dayEnd)
      .reduce((sum, l) => sum + l.amountMg, 0);
    return { day: DAY_NAMES[new Date(dayStart).getDay()], load };
  });
}

interface Stats {
  avgDaily:    number;   // mg/day over last 7 days
  weekTotal:   number;   // mg over last 7 days
  peakHour:    number | null;
  sodiumToday: number;   // mg
  hourly:      number[]; // 24 buckets, caffeine mg by hour-of-day
}

function buildStats(logs: ReturnType<typeof selectAllLogs>): Stats {
  const now      = Date.now();
  const weekAgo  = now - 7 * DAY_MS;
  const caf      = logs.filter((l) => l.substanceType === 'caffeine');
  const weekCaf  = caf.filter((l) => l.timestamp >= weekAgo);
  const weekTotal = weekCaf.reduce((s, l) => s + l.amountMg, 0);

  const hourly = new Array(24).fill(0) as number[];
  caf.forEach((l) => { hourly[new Date(l.timestamp).getHours()] += l.amountMg; });
  const peakHour = hourly.some((v) => v > 0) ? hourly.indexOf(Math.max(...hourly)) : null;

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const sodiumToday = logs
    .filter((l) => l.substanceType === 'sodium' && l.timestamp >= midnight.getTime())
    .reduce((s, l) => s + l.amountMg, 0);

  return {
    avgDaily:    Math.round(weekTotal / 7),
    weekTotal:   Math.round(weekTotal),
    peakHour,
    sodiumToday: Math.round(sodiumToday),
    hourly,
  };
}

// ── SVG path helpers ──────────────────────────────────────────────────────────

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

// ── Card shell ────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}><View style={s.cardInner}>{children}</View></View>;
}

// ── Weekly caffeine bar chart ─────────────────────────────────────────────────

function WeeklyBarChart({ chartWidth, data }: { chartWidth: number; data: DayLoad[] }) {
  const CHART_H = 168;
  const PAD     = { top: 8, right: 8, bottom: 28, left: 32 };
  const plotW   = chartWidth - PAD.left - PAD.right;
  const plotH   = CHART_H - PAD.top - PAD.bottom;
  const maxLoad = Math.max(...data.map((d) => d.load), 1);
  const barStep = plotW / data.length;
  const barW    = barStep * 0.52;

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="trBarGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.primary} stopOpacity={0.9} />
          <Stop offset="1" stopColor={color.primary} stopOpacity={0.25} />
        </SvgGradient>
      </Defs>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.top + plotH * (1 - f);
        return (
          <G key={f}>
            <Line x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y} stroke={alpha(color.text, 0.04)} strokeWidth={1} strokeDasharray="3 3" />
            <SvgText x={PAD.left - 4} y={y + 3} fill={color.textMid} fontSize={7} textAnchor="end" fontFamily="monospace">{Math.round(maxLoad * f)}</SvgText>
          </G>
        );
      })}
      <Line x1={PAD.left} y1={PAD.top + plotH} x2={chartWidth - PAD.right} y2={PAD.top + plotH} stroke={alpha(color.text, 0.08)} strokeWidth={1} />
      {data.map((d, i) => {
        const barH = (d.load / maxLoad) * plotH;
        const x = PAD.left + i * barStep + (barStep - barW) / 2;
        const y = PAD.top + plotH - barH;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill="url(#trBarGrad)" rx={4} />
            <SvgText x={x + barW / 2} y={CHART_H - 6} fill={color.textMid} fontSize={8} textAnchor="middle" fontFamily="monospace">{d.day}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Caffeine by hour-of-day (replaces the old fake correlation chart) ─────────

function CaffeineByHourChart({ chartWidth, hourly }: { chartWidth: number; hourly: number[] }) {
  const CHART_H = 150;
  const PAD     = { top: 8, right: 6, bottom: 26, left: 6 };
  const plotW   = chartWidth - PAD.left - PAD.right;
  const plotH   = CHART_H - PAD.top - PAD.bottom;
  const baseY   = PAD.top + plotH;
  const max     = Math.max(...hourly, 1);
  const step    = plotW / (hourly.length - 1);

  const pts: [number, number][] = hourly.map((v, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (v / max) * plotH,
  ]);

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="trHourGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={color.primary} stopOpacity={0.35} />
          <Stop offset="0.7" stopColor={color.primary} stopOpacity={0.06} />
          <Stop offset="1"   stopColor={color.primary} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Line x1={PAD.left} y1={baseY} x2={chartWidth - PAD.right} y2={baseY} stroke={alpha(color.text, 0.07)} strokeWidth={1} />
      <Path d={smoothArea(pts, baseY)} fill="url(#trHourGrad)" />
      <Path d={smoothLine(pts)} stroke={color.primary} strokeWidth={2} fill="none" />
      {[0, 6, 12, 18].map((h) => (
        <SvgText key={h} x={PAD.left + h * step} y={CHART_H - 6} fill={color.textMid} fontSize={8} textAnchor="middle" fontFamily="monospace">
          {String(h).padStart(2, '0')}h
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={[s.statTile, { borderColor: alpha(accent, 0.18) }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

// ── TRENDS screen ─────────────────────────────────────────────────────────────

export default function TrendsScreen() {
  const insets       = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const chartWidth   = W - space.xl * 2 - space.lg * 2;

  const logs       = useBioStore(selectAllLogs);
  const weeklyData = useMemo(() => buildWeeklyLoad(logs), [logs]);
  const stats      = useMemo(() => buildStats(logs), [logs]);

  const screenAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenAnim, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [screenAnim]);

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[s.titleBlock, { opacity: screenAnim }]}>
          <Text style={s.eyebrow}>YOUR PATTERNS</Text>
          <Text style={s.pageTitle}>TRENDS</Text>
        </Animated.View>

        <Text style={s.sectionLabel}>▸  READINESS WINDOWS</Text>
        <View style={s.fullBleed}><OptimalWindows /></View>

        <Text style={[s.sectionLabel, s.sectionGap]}>▸  12-HOUR FORECAST</Text>
        <View style={s.fullBleed}><PredictiveChart /></View>

        <Text style={[s.sectionLabel, s.sectionGap]}>▸  WEEKLY CAFFEINE LOAD</Text>
        <Card>
          <Text style={s.cardSubtitle}>TOTAL MG PER DAY · LAST 7 DAYS</Text>
          <WeeklyBarChart chartWidth={chartWidth} data={weeklyData} />
        </Card>

        <Text style={[s.sectionLabel, s.sectionGap]}>▸  WHEN YOU CAFFEINATE</Text>
        <Card>
          <Text style={s.cardSubtitle}>CAFFEINE MG BY HOUR OF DAY</Text>
          <CaffeineByHourChart chartWidth={chartWidth} hourly={stats.hourly} />
        </Card>

        <Text style={[s.sectionLabel, s.sectionGap]}>▸  SUMMARY</Text>
        <View style={s.statsGrid}>
          <StatTile label="AVG DAILY"   value={`${stats.avgDaily}mg`} accent={color.primary} />
          <StatTile label="PEAK HOUR"   value={stats.peakHour !== null ? `${String(stats.peakHour).padStart(2, '0')}:00` : '—'} accent={color.energy} />
          <StatTile label="7-DAY TOTAL" value={`${stats.weekTotal}mg`} accent={color.ready} />
          <StatTile label="SODIUM TODAY" value={`${stats.sodiumToday}mg`} accent={color.sodium} />
        </View>

        <Text style={[s.sectionLabel, s.sectionGap]}>▸  RECENT ACTIVITY</Text>
        <View style={s.fullBleed}><SystemLog /></View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.xl },

  titleBlock: { marginBottom: space.xxl },
  eyebrow:   { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.textMid, marginBottom: 5 },
  pageTitle: { fontFamily: font.mono, fontSize: 24, fontWeight: '200', letterSpacing: 1, color: color.primary },

  sectionLabel: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.textMid, marginBottom: space.md, marginLeft: 2 },
  sectionGap:   { marginTop: space.xxl },

  card: {
    borderRadius: 20, borderWidth: 0.5, borderColor: color.border, backgroundColor: color.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  cardInner:    { padding: space.lg, paddingBottom: space.md },
  cardSubtitle: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginBottom: space.lg },

  fullBleed: { marginHorizontal: -space.xl },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  statTile: {
    flex: 1, minWidth: '45%', borderRadius: 14, borderWidth: 1,
    backgroundColor: color.surface, padding: space.lg,
  },
  statLabel: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textMid, marginBottom: space.md },
  statValue: { fontFamily: font.mono, fontSize: 24, fontWeight: '200', letterSpacing: 0 },
});
