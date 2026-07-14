import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { LogEntry } from '../src/store/useBioStore';
import { alpha, color, font, space } from '../src/theme/tokens';
import { fmtClock } from '../src/utils/energyState';
import { AuroraCurtain } from './AuroraCurtain';

interface NightMapProps {
  logs: LogEntry[];
  nowMs: number;
  readyAtMs: number | null;
  targetSleepAtMs: number;
  halfLifeHours: number;
  width: number;
}

const HEIGHT = 178;
const PAD_X = 14;

function delayMinutes(targetMs: number, readyMs: number | null): number {
  return Math.max(0, Math.round(((readyMs ?? targetMs) - targetMs) / 60_000));
}

function routeY(progress: number, width: number): number {
  return 130 - Math.sin(Math.min(1, progress / (width - PAD_X * 2)) * Math.PI) * 58;
}

function buildCurvePath(width: number): string {
  const plotWidth = width - PAD_X * 2;
  const segments = 28;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const x = PAD_X + (plotWidth * index) / segments;
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${routeY(x - PAD_X, width).toFixed(1)}`;
  }).join(' ');
}

export function NightMap({ logs, nowMs, readyAtMs, targetSleepAtMs, width }: NightMapProps) {
  const drinks = useMemo(() => logs
    .filter((log) => log.substanceType === 'caffeine' && log.timestamp >= nowMs - 12 * 3_600_000 && log.timestamp <= nowMs)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-4), [logs, nowMs]);
  const minutesLate = delayMinutes(targetSleepAtMs, readyAtMs);
  const targetX = Math.max(146, Math.min(width - 82, width * .64));
  const estimateX = minutesLate ? Math.min(width - PAD_X, Math.max(targetX + 48, targetX + minutesLate * .52)) : targetX;
  const targetY = routeY(targetX - PAD_X, width);
  const estimateY = routeY(estimateX - PAD_X, width);
  const currentReady = readyAtMs ?? targetSleepAtMs;
  const routePath = buildCurvePath(width);
  const curtainPath = `${routePath} L${width - PAD_X} 150 L${PAD_X} 150 Z`;
  const detourPath = minutesLate ? `M${targetX} ${targetY} C${targetX + 17} ${targetY - 2} ${estimateX - 15} ${estimateY + 8} ${estimateX} ${estimateY}` : '';

  return <View style={styles.card} accessibilityLabel={`Night Map: target ${fmtClock(targetSleepAtMs)}, current landing ${fmtClock(currentReady)}`}>
    <View style={styles.header}>
      <View><Text style={styles.label}>NIGHT MAP</Text><Text style={styles.title}>Your sleep route tonight.</Text></View>
      <Text style={[styles.status, !minutesLate && styles.onCourse]}>{minutesLate ? `+${minutesLate} MIN` : 'ON COURSE'}</Text>
    </View>
    <View style={styles.times}>
      <View><Text style={styles.timeLabel}>TARGET</Text><Text style={styles.timeValue}>{fmtClock(targetSleepAtMs)}</Text></View>
      <View style={styles.timeRight}><Text style={styles.timeLabel}>LANDING</Text><Text style={[styles.timeValue, minutesLate ? styles.lateTime : styles.readyTime]}>{fmtClock(currentReady)}</Text></View>
    </View>
    <View style={[styles.mapVisual, { height: HEIGHT }]}>
      <AuroraCurtain width={width} height={HEIGHT} curvePath={routePath} curtainPath={curtainPath} />
      <Svg width={width} height={HEIGHT}>
        <Rect x={PAD_X} y={20} width={width - PAD_X * 2} height={122} rx={14} fill={alpha(color.primary, .018)} stroke={alpha(color.text, .08)} strokeWidth={1} />
        <Line x1={PAD_X} y1={132} x2={width - PAD_X} y2={132} stroke={alpha(color.text, .12)} strokeWidth={1} />
        {minutesLate ? <Path d={detourPath} stroke={color.energy} strokeOpacity={.8} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeDasharray="3 4" /> : null}
        {drinks.map((drink, index) => {
          const x = PAD_X + 22 + ((index + 1) / (drinks.length + 1)) * Math.max(44, targetX - PAD_X - 34);
          const y = routeY(x - PAD_X, width);
          const accent = drink.amountMg >= 120 ? color.energy : color.primary;
          return <React.Fragment key={drink.id}><Line x1={x} y1={y + 7} x2={x} y2={y + 20} stroke={alpha(accent, .5)} strokeWidth={1} /><Circle cx={x} cy={y} r={4.2} fill={color.bg} stroke={accent} strokeWidth={1.4} /></React.Fragment>;
        })}
        <Circle cx={targetX} cy={targetY} r={9} fill={color.bg} stroke={minutesLate ? color.routeTarget : color.ready} strokeWidth={1.5} />
        <Circle cx={targetX} cy={targetY} r={2.5} fill={minutesLate ? color.routeTarget : color.ready} />
        {minutesLate ? <><Circle cx={estimateX} cy={estimateY} r={8.5} fill={color.bg} stroke={color.energy} strokeWidth={1.6} /><Circle cx={estimateX} cy={estimateY} r={2.4} fill={color.energy} /></> : null}
        <SvgText x={PAD_X} y={161} fill={color.textMid} fontFamily={font.mono} fontSize={9}>NOW</SvgText>
        <SvgText x={targetX} y={targetY - 14} fill={color.routeTarget} fontFamily={font.mono} fontSize={9} textAnchor="middle">TARGET</SvgText>
        {minutesLate ? <SvgText x={estimateX} y={estimateY - 14} fill={color.energy} fontFamily={font.mono} fontSize={9} textAnchor="middle">ESTIMATE</SvgText> : null}
      </Svg>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: {},
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { color: color.textMid, fontFamily: font.mono, fontSize: 11, letterSpacing: 1 },
  title: { color: color.text, fontSize: 17, fontWeight: '500', marginTop: 5 },
  status: { color: color.energy, fontFamily: font.mono, fontSize: 11, letterSpacing: .6, paddingTop: 4 },
  onCourse: { color: color.ready },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  timeRight: { alignItems: 'flex-end' },
  timeLabel: { color: color.textDim, fontFamily: font.mono, fontSize: 9, letterSpacing: .7 },
  timeValue: { color: color.text, fontFamily: font.mono, fontSize: 18, fontWeight: '300', marginTop: 3 },
  lateTime: { color: color.energy },
  readyTime: { color: color.ready },
  mapVisual: { position: 'relative', overflow: 'hidden', marginTop: 4 },
});
