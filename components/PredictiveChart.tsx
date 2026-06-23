import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Path,
  Line,
  Text as SvgText,
} from 'react-native-svg';

const C = {
  NEON_Y:  '#FFFF33',
  BLOOD_R: '#FF073A',
  MID:     '#555555',
  DIM:     '#2A2A2A',
  TEXT:    '#FFFFFF',
} as const;

const MONO   = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const IS_WEB = Platform.OS === 'web';
const WEB_BD: object = IS_WEB
  ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }
  : {};

// ── Caffeine decay data (140mg starting dose, 5h half-life) ─────────────────
function generateData() {
  const rows = [];
  for (let i = 0; i <= 12; i++) {
    const caffeine = Math.round(140 * Math.exp(-0.139 * i));
    const sugar =
      i <= 1
        ? Math.round(20 + 80 * i)
        : Math.round(100 * Math.exp(-0.6 * (i - 1)));
    rows.push({ hour: `${i}h`, caffeine, sugar: Math.max(sugar, 2) });
  }
  return rows;
}

const DATA = generateData();
const MAX_Y = 160;

// ── SVG path helpers ─────────────────────────────────────────────────────────

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
  const line = smoothLine(pts);
  const last  = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last[0].toFixed(1)} ${baseY} L ${first[0].toFixed(1)} ${baseY} Z`;
}

// ── Inner chart ───────────────────────────────────────────────────────────────

function Chart({ chartWidth }: { chartWidth: number }) {
  const CHART_H = 160;
  const PAD     = { top: 8, right: 6, bottom: 24, left: 26 };
  const plotW   = chartWidth - PAD.left - PAD.right;
  const plotH   = CHART_H  - PAD.top  - PAD.bottom;
  const baseY   = PAD.top + plotH;
  const step    = plotW / (DATA.length - 1);

  const cafPts: [number, number][] = DATA.map((d, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (d.caffeine / MAX_Y) * plotH,
  ]);
  const sugPts: [number, number][] = DATA.map((d, i) => [
    PAD.left + i * step,
    PAD.top + plotH - (d.sugar / MAX_Y) * plotH,
  ]);

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

      {/* Horizontal grid */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <Line
          key={f}
          x1={PAD.left}
          y1={PAD.top + plotH * (1 - f)}
          x2={chartWidth - PAD.right}
          y2={PAD.top + plotH * (1 - f)}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}

      {/* X axis baseline */}
      <Line
        x1={PAD.left}  y1={baseY}
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

      {/* X labels every 2h */}
      {DATA.map((d, i) =>
        i % 2 === 0 ? (
          <SvgText
            key={d.hour}
            x={PAD.left + i * step}
            y={CHART_H - 4}
            fill={C.MID}
            fontSize={8}
            textAnchor="middle"
            fontFamily="monospace"
          >
            {d.hour}
          </SvgText>
        ) : null,
      )}

      {/* Y labels */}
      {[0, 40, 80, 120, 160].map((v) => (
        <SvgText
          key={v}
          x={PAD.left - 4}
          y={PAD.top + plotH - (v / MAX_Y) * plotH + 3}
          fill={C.MID}
          fontSize={7}
          textAnchor="end"
          fontFamily="monospace"
        >
          {v}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function PredictiveChart() {
  const { width: screenW } = useWindowDimensions();
  // Account for screen horizontal padding (20px each side) + card internal padding (16px each side)
  const chartWidth = screenW - 20 * 2 - 16 * 2;

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  // Empty dep array → runs exactly once on mount (fadeAnim/slideAnim are
  // stable Animated.Value refs from useRef — never change between renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
    >
      <View style={[s.card, IS_WEB ? WEB_BD : {}]}>
        <View style={s.inner}>
          {/* Header row */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>METABOLIC FORECAST</Text>
              <Text style={s.subtitle}>NEXT  12  HOURS</Text>
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.NEON_Y }]} />
                <Text style={s.legendLabel}>CAFFEINE</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.BLOOD_R }]} />
                <Text style={s.legendLabel}>SUGAR</Text>
              </View>
            </View>
          </View>

          <Chart chartWidth={chartWidth} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // BlurView removed — solid dark background enables native shadows
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0C0C0C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  inner: {
    padding: 16,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  title: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 3,
    color: C.MID,
    marginTop: 3,
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.MID,
  },
});
