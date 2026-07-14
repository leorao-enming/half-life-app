// =============================================================================
// components/SipTrace.tsx — A readable, original event trace for caffeine logs.
// Each line begins at a recorded drink and fades as that drink's estimated
// caffeine contribution decays. This is deliberately not a coffee illustration.
// =============================================================================

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { LogEntry } from '../src/store/useBioStore';
import { alpha, color, font, space } from '../src/theme/tokens';

interface SipTraceProps {
  logs: LogEntry[];
  halfLifeHours: number;
  nowMs: number;
  width: number;
}

interface TraceEvent {
  id: string;
  label: string;
  amountMg: number;
  timestamp: number;
  activeMg: number;
  accent: string;
}

const HEIGHT = 164;
const PAD_X = 14;
const TOP = 18;
const BASELINE = 136;
const HOURS_BEFORE = 10;
const HOURS_AFTER = 12;

function traceAccent(label: string): string {
  const normalised = label.toLowerCase();
  if (normalised.includes('tea') || normalised.includes('matcha')) return '#89C6A8';
  if (normalised.includes('energy')) return '#A77AD9';
  if (normalised.includes('cola')) return '#7C93C9';
  return color.primary;
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function curvePoints(
  event: TraceEvent,
  startMs: number,
  endMs: number,
  halfLifeHours: number,
  width: number,
  lane: number,
): Array<[number, number]> {
  const plotWidth = width - PAD_X * 2;
  const eventStart = Math.max(event.timestamp, startMs);
  const pointCount = 18;
  const points: Array<[number, number]> = [];
  const initial = Math.max(event.amountMg, 1);
  const laneOffset = lane * 2;

  for (let i = 0; i < pointCount; i++) {
    const t = eventStart + ((endMs - eventStart) * i) / (pointCount - 1);
    const elapsedHours = Math.max(0, (t - event.timestamp) / 3_600_000);
    const remaining = event.amountMg * Math.pow(0.5, elapsedHours / halfLifeHours);
    const x = PAD_X + ((t - startMs) / (endMs - startMs)) * plotWidth;
    const amplitude = 62 * Math.min(1, remaining / initial);
    const y = BASELINE - amplitude - laneOffset;
    points.push([x, y]);
  }

  return points;
}

function curvePath(points: Array<[number, number]>): string {
  return points.reduce(
    (path, point, index) => `${path}${index === 0 ? 'M' : ' L'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`,
    '',
  );
}

export function SipTrace({ logs, halfLifeHours, nowMs, width }: SipTraceProps) {
  const events = useMemo<TraceEvent[]>(() => logs
    .filter((log) => log.substanceType === 'caffeine' && log.timestamp >= nowMs - 24 * 3_600_000)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((log) => ({
      id: log.id,
      label: log.label,
      amountMg: log.amountMg,
      timestamp: log.timestamp,
      activeMg: log.amountMg * Math.pow(0.5, Math.max(0, (nowMs - log.timestamp) / 3_600_000) / halfLifeHours),
      accent: traceAccent(log.label),
    })), [logs, halfLifeHours, nowMs]);

  if (!events.length) return null;

  const startMs = nowMs - HOURS_BEFORE * 3_600_000;
  const endMs = nowMs + HOURS_AFTER * 3_600_000;
  const plotWidth = width - PAD_X * 2;
  const totalActive = events.reduce((total, event) => total + event.activeMg, 0);
  const nowX = PAD_X + (HOURS_BEFORE / (HOURS_BEFORE + HOURS_AFTER)) * plotWidth;

  return (
    <View style={styles.card} accessibilityLabel={`Sip Trace showing ${events.length} recent caffeine records and an estimated ${Math.round(totalActive)} milligrams still active`}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>SIP TRACE</Text>
          <Text style={styles.title}>Which choices still affect tonight.</Text>
        </View>
        <Text style={styles.active}>{Math.round(totalActive)} MG{`\n`}ACTIVE</Text>
      </View>

      <Svg width={width} height={HEIGHT}>
        <Defs>
          {events.map((event) => (
            <LinearGradient key={`gradient-${event.id}`} id={`sip-${event.id}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={event.accent} stopOpacity={0.92} />
              <Stop offset="0.72" stopColor={event.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={event.accent} stopOpacity={0.02} />
            </LinearGradient>
          ))}
        </Defs>

        <Rect x={PAD_X} y={BASELINE - 10} width={plotWidth} height={16} rx={8} fill={alpha(color.ready, 0.055)} />
        <Line x1={PAD_X} y1={BASELINE} x2={width - PAD_X} y2={BASELINE} stroke={alpha(color.ready, 0.38)} strokeWidth={1} strokeDasharray="3 5" />
        <SvgText x={width - PAD_X} y={TOP + 4} fill={alpha(color.ready, 0.72)} fontFamily={font.mono} fontSize={10} textAnchor="end">LOW IMPACT</SvgText>
        <Line
          x1={nowX}
          y1={TOP}
          x2={nowX}
          y2={BASELINE + 8}
          stroke={alpha(color.text, 0.25)}
          strokeWidth={1}
          strokeDasharray="2 5"
        />

        {events.map((event, index) => {
          const x = PAD_X + ((Math.max(event.timestamp, startMs) - startMs) / (endMs - startMs)) * plotWidth;
          const y = BASELINE - 62 - index * 3;
          const points = curvePoints(event, startMs, endMs, halfLifeHours, width, index);
          const dotIndexes = index === events.length - 1 ? [4, 8, 12, 16] : [7, 14];
          return (
            <React.Fragment key={event.id}>
              <Path d={curvePath(points)} stroke={`url(#sip-${event.id})`} strokeWidth={index === events.length - 1 ? 2.5 : 1.15} opacity={index === events.length - 1 ? 1 : 0.56} fill="none" strokeLinecap="round" />
              {dotIndexes.map((pointIndex) => <Circle key={`${event.id}-dot-${pointIndex}`} cx={points[pointIndex][0]} cy={points[pointIndex][1]} r={index === events.length - 1 ? 2.2 : 1.5} fill={event.accent} opacity={index === events.length - 1 ? .78 : .42} />)}
              <Circle cx={x} cy={y} r={index === events.length - 1 ? 4 : 3} fill={event.accent} />
              <Circle cx={x} cy={y} r={index === events.length - 1 ? 7 : 5} fill="none" stroke={alpha(event.accent, 0.28)} strokeWidth={1} />
            </React.Fragment>
          );
        })}
        <Circle cx={nowX} cy={BASELINE - 10} r={4} fill={color.bg} stroke={color.primary} strokeWidth={2} />
      </Svg>

      <View style={styles.axis}>
        <Text style={styles.axisText}>{clock(startMs)}</Text>
        <Text style={styles.now}>NOW</Text>
        <Text style={styles.axisText}>{clock(endMs)}</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.sm },
  label: { color: color.primary, fontFamily: font.mono, fontSize: 13, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: color.text, fontSize: 17, lineHeight: 23, fontWeight: '500', marginTop: 5, maxWidth: 220 },
  active: { color: color.textMid, fontFamily: font.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textAlign: 'right' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  axisText: { color: color.textMid, fontFamily: font.mono, fontSize: 12 },
  now: { color: color.primary, fontFamily: font.mono, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
});
