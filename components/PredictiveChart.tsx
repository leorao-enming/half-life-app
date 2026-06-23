import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import {
  useBioStore,
  selectAllLogs,
  selectCafFactor,
  selectHealthKitMultiplier,
} from '../src/store/useBioStore';
import { generateForecast } from '../src/utils/kinetics';
import { color } from '../src/theme/tokens';

const C = {
  NEON_Y:  color.primary, // caffeine — hero accent
  BLOOD_R: color.energy,  // sugar — energy accent
  MID:     color.textMid,
  DIM:     color.textDim,
} as const;

const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const IS_WEB = Platform.OS === 'web';
const WEB_BD: object = IS_WEB
  ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }
  : {};

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
  const line  = smoothLine(pts);
  const last  = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last[0].toFixed(1)} ${baseY} L ${first[0].toFixed(1)} ${baseY} Z`;
}

// ── Inner chart ───────────────────────────────────────────────────────────────

interface ChartProps {
  chartWidth: number;
  cafData:    number[];
  sugarData:  number[];
  maxCaf:     number;
  hours:      string[];
}

function Chart({ chartWidth, cafData, sugarData, maxCaf, hours }: ChartProps) {
  const CHART_H  = 160;
  const PAD      = { top: 8, right: 6, bottom: 24, left: 30 };
  const plotW    = chartWidth - PAD.left - PAD.right;
  const plotH    = CHART_H - PAD.top - PAD.bottom;
  const baseY    = PAD.top + plotH;
  const step     = plotW / Math.max(hours.length - 1, 1);
  const safeMax  = maxCaf > 0 ? maxCaf : 1;

  // Normalise sugar to the same vertical scale as caffeine for visual comparison.
  // Sugar values are in grams; caffeine in mg. Both normalised to safeMax.
  const maxSugar = Math.max(...sugarData, 1);

  const cafPts: [number, number][] = cafData.map((v, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (v / safeMax) * plotH,
  ]);
  const sugPts: [number, number][] = sugarData.map((v, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (v / maxSugar) * plotH,
  ]);

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(safeMax * f));

  return (
    <Svg width={chartWidth} height={CHART_H}>
      <Defs>
        <SvgGradient id="pcCafGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.NEON_Y}  stopOpacity={0.35} />
          <Stop offset="0.6" stopColor={C.NEON_Y}  stopOpacity={0.07} />
          <Stop offset="1"   stopColor={C.NEON_Y}  stopOpacity={0}    />
        </SvgGradient>
        <SvgGradient id="pcSugGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={C.BLOOD_R} stopOpacity={0.30} />
          <Stop offset="0.6" stopColor={C.BLOOD_R} stopOpacity={0.06} />
          <Stop offset="1"   stopColor={C.BLOOD_R} stopOpacity={0}    />
        </SvgGradient>
      </Defs>

      {/* Horizontal grid lines */}
      {[0.25, 0.5, 0.75, 1].map((f, idx) => (
        <Line
          key={idx}
          x1={PAD.left} y1={PAD.top + plotH * (1 - f)}
          x2={chartWidth - PAD.right} y2={PAD.top + plotH * (1 - f)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {/* Y labels (caffeine mg) */}
      {yLabels.map((v, idx) => (
        <SvgText
          key={idx}
          x={PAD.left - 4}
          y={PAD.top + plotH - (v / safeMax) * plotH + 3}
          fill={C.MID} fontSize={7} textAnchor="end" fontFamily="monospace"
        >{v}</SvgText>
      ))}

      {/* X axis baseline */}
      <Line
        x1={PAD.left} y1={baseY}
        x2={chartWidth - PAD.right} y2={baseY}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={1}
      />

      {/* Sugar fill + line */}
      <Path d={smoothArea(sugPts, baseY)} fill="url(#pcSugGrad)" />
      <Path d={smoothLine(sugPts)} stroke={C.BLOOD_R} strokeWidth={1.5} fill="none" />

      {/* Caffeine fill + line */}
      <Path d={smoothArea(cafPts, baseY)} fill="url(#pcCafGrad)" />
      <Path d={smoothLine(cafPts)} stroke={C.NEON_Y} strokeWidth={2} fill="none" />

      {/* X labels every 2 hours */}
      {hours.map((h, i) =>
        i % 2 === 0 ? (
          <SvgText
            key={h}
            x={PAD.left + i * step} y={CHART_H - 4}
            fill={C.MID} fontSize={8} textAnchor="middle" fontFamily="monospace"
          >{h}</SvgText>
        ) : null,
      )}
    </Svg>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function PredictiveChart() {
  const { width: screenW } = useWindowDimensions();
  // Inner chart width: screen − horizontal padding (20×2) − card inner padding (16×2)
  const chartWidth = screenW - 20 * 2 - 16 * 2;

  const logs      = useBioStore(selectAllLogs);
  const cafFactor = useBioStore(selectCafFactor);
  const hkMult    = useBioStore(selectHealthKitMultiplier);

  // Refresh every minute — chart does not need second-level precision
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const forecast = useMemo(
    () => generateForecast(logs, cafFactor, hkMult, nowMs),
    [logs, cafFactor, hkMult, nowMs],
  );

  const cafData   = forecast.map((p) => p.caffeine);
  const sugarData = forecast.map((p) => p.sugar);
  const hours     = forecast.map((p) => p.hour);
  const maxCaf    = Math.max(...cafData, 1);

  const hasData = logs.some(
    (l) => l.substanceType === 'caffeine' || l.substanceType === 'sugar',
  );

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, delay: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay: 100, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[s.card, IS_WEB ? WEB_BD : {}]}>
        <View style={s.inner}>
          <View style={s.header}>
            <View>
              <Text style={s.title}>METABOLIC FORECAST</Text>
              <Text style={s.subtitle}>NEXT  12  HOURS</Text>
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.NEON_Y }]} />
                <Text style={s.legendLabel}>CAFFEINE (MG)</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.BLOOD_R }]} />
                <Text style={s.legendLabel}>SUGAR (G)</Text>
              </View>
            </View>
          </View>

          {hasData ? (
            <Chart
              chartWidth={chartWidth}
              cafData={cafData}
              sugarData={sugarData}
              maxCaf={maxCaf}
              hours={hours}
            />
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyText}>NO DATA  ·  INJECT TO POPULATE FORECAST</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom:     16,
    borderRadius:     16,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.07)',
    backgroundColor:  '#0C0C0C',
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.35,
    shadowRadius:     8,
    elevation:        5,
  },
  inner: {
    padding:       16,
    paddingBottom: 12,
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   14,
  },
  title: {
    fontFamily:    MONO,
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 2,
    color:         '#FFFFFF',
  },
  subtitle: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    color:         C.MID,
    marginTop:     3,
  },
  legend: {
    flexDirection: 'row',
    gap:           12,
    alignItems:    'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  legendDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  legendLabel: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
  },
  empty: {
    height:         120,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    color:         C.DIM,
  },
});
