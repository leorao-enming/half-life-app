import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurfewStamp as CurfewStampGraphic } from '../../components/CurfewStamp';
import { buildCurfewStamps, countLateStamps, type CurfewStamp } from '../../src/domain/patterns';
import { selectAllLogs, useBioStore } from '../../src/store/useBioStore';
import { alpha, color, font, space } from '../../src/theme/tokens';

function StampMark({ stamp, index, width }: { stamp: CurfewStamp; index: number; width: number }) {
  const x = 40 + index * ((width - 80) / 6);
  const hour = stamp.latestHour;
  const y = hour === null ? 262 : 48 + Math.min(200, Math.max(0, hour - 22) * 15);
  const accent = hour !== null && hour >= 17 ? color.energy : color.primary;
  const label = stamp.label.replace('\n', ' ');

  return <>
    <SvgText x={x} y={17} fill={color.text} fontFamily={font.mono} fontSize={10} textAnchor="middle">{label}</SvgText>
    <Line x1={x} y1={29} x2={x} y2={282} stroke={alpha(color.text, .22)} strokeWidth={1} />
    {hour !== null && <Line x1={x} y1={y - 18} x2={x} y2={y + 18} stroke={alpha(accent, .6)} strokeWidth={1} strokeDasharray="2 4" />}
    <Circle cx={x} cy={y} r={hour === null ? 3 : 8} fill={hour === null ? alpha(color.text, .13) : alpha(accent, .22)} stroke={hour === null ? color.textDim : accent} strokeWidth={1.5} />
    {hour !== null && <Circle cx={x} cy={y} r={3} fill={accent} />}
  </>;
}

export default function PatternsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logs = useBioStore(selectAllLogs);
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const data = useMemo(() => buildCurfewStamps(logs, range), [logs, range]);
  const late = countLateStamps(data);
  const chartWidth = width - space.xl * 2;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 106 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.title}>PATTERNS</Text><Text style={styles.subtitle}>Your {range}-day view.</Text></View>
        <Text style={styles.axisLabel}>10 PM</Text>
        <View style={styles.chartWrap} accessibilityLabel={`${range}-day pattern view with ${late} late caffeine periods`}>
          <Svg width={chartWidth} height={300}>
            {[80, 134, 188, 242].map((y) => <Line key={y} x1={26} y1={y} x2={chartWidth - 14} y2={y} stroke={alpha(color.text, .08)} strokeWidth={1} />)}
            {data.map((stamp, index) => <StampMark key={stamp.id} stamp={stamp} index={index} width={chartWidth} />)}
          </Svg>
          <View style={styles.timeScale}><Text style={styles.time}>10 PM</Text><Text style={styles.time}>12 AM</Text><Text style={styles.time}>2 AM</Text><Text style={styles.time}>4 AM</Text><Text style={styles.time}>6 AM</Text></View>
        </View>

        <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color.primary }]} /><Text style={styles.legendText}>Low impact</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color.energy }]} /><Text style={styles.legendText}>Moderate</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#A77AD9' }]} /><Text style={styles.legendText}>High</Text></View></View>

        <View style={styles.stampsCard}>
          <Text style={styles.cardLabel}>CURFEW STAMPS</Text>
          <View style={styles.stampRow}>{data.map((stamp) => <View key={`stamp-${stamp.id}`} style={styles.stampItem}><CurfewStampGraphic detail={stamp.detail} size={30} /><Text style={styles.stampLabel}>{stamp.label.replace('\n', ' ')}</Text></View>)}</View>
          <Text style={styles.stampSummary}>{late ? `${late} late period${late > 1 ? 's' : ''} in this view.` : 'Keep logging to reveal your curfew rhythm.'}</Text>
        </View>

        <View style={styles.range}>{([7, 30, 90] as const).map((value) => <Pressable key={value} onPress={() => setRange(value)} accessibilityRole="button" accessibilityState={{ selected: range === value }} style={[styles.rangeButton, range === value && styles.rangeButtonActive]}><Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value}D</Text></Pressable>)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg },
  header: { alignItems: 'center', paddingBottom: space.xxl },
  title: { color: color.text, fontFamily: font.mono, fontSize: 14, letterSpacing: 1.5 },
  subtitle: { color: color.textMid, fontSize: 13, marginTop: 6 },
  axisLabel: { color: color.textMid, fontFamily: font.mono, fontSize: 10, marginLeft: 1, marginBottom: -2 },
  chartWrap: { paddingTop: 2 },
  timeScale: { position: 'absolute', left: 1, top: 54, height: 210, justifyContent: 'space-between' },
  time: { color: color.textMid, fontFamily: font.mono, fontSize: 9 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.lg, marginTop: -4, marginBottom: space.xl },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: color.textMid, fontSize: 11 },
  stampsCard: { borderRadius: 16, borderWidth: 1, borderColor: alpha(color.text, .18), backgroundColor: alpha(color.surfaceHi, .42), padding: space.lg },
  cardLabel: { color: color.textMid, fontFamily: font.mono, fontSize: 11, letterSpacing: .9 },
  stampRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  stampItem: { alignItems: 'center', width: 31 },
  stampLabel: { color: color.textMid, fontFamily: font.mono, fontSize: 9, marginTop: 6 },
  stampSummary: { color: color.textMid, fontSize: 13, marginTop: space.md },
  range: { flexDirection: 'row', borderRadius: 19, padding: 3, borderWidth: 1, borderColor: alpha(color.text, .2), backgroundColor: alpha(color.surfaceHi, .4), marginTop: space.xl },
  rangeButton: { flex: 1, minHeight: 36, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rangeButtonActive: { backgroundColor: alpha(color.primary, .15), borderWidth: 1, borderColor: alpha(color.primary, .58) },
  rangeText: { color: color.textMid, fontFamily: font.mono, fontSize: 12 },
  rangeTextActive: { color: color.primary },
});
