import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useBioStore } from '../src/store/useBioStore';
import { color, font, type as T, space, tracking, alpha } from '../src/theme/tokens';

function substanceColor(type: string): string {
  switch (type) {
    case 'caffeine': return color.primary;
    case 'sugar':    return color.energy;
    case 'sodium':   return color.sodium;
    default:         return color.alert;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAmount(amountMg: number, type: string): string {
  if (type === 'sugar') return amountMg >= 1000 ? `${(amountMg / 1000).toFixed(0)}g` : `${amountMg}mg`;
  return `${amountMg}mg`;
}

interface LogEntryProps { time: string; label: string; detail: string; c: string; isLast: boolean }

function LogEntry({ time, label, detail, c, isLast }: LogEntryProps) {
  return (
    <View style={s.entry}>
      <View style={s.dotCol}>
        <View style={[s.dotRing, { borderColor: alpha(c, 0.33) }]}>
          <View style={[s.dot, { backgroundColor: c, shadowColor: c }]} />
        </View>
        {!isLast && <View style={[s.connector, { backgroundColor: alpha(c, 0.19) }]} />}
      </View>
      <View style={s.card}>
        <View style={s.cardTop}>
          <Text style={[s.timeText, { color: c }]}>{time}</Text>
          <Text style={s.separator}>|</Text>
          <Text style={s.labelText}>{label}</Text>
        </View>
        <Text style={s.detailText}>{detail}</Text>
      </View>
    </View>
  );
}

export function SystemLog() {
  const logs = useBioStore((state) => state.logs);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, delay: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const recent = [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);

  return (
    <Animated.View style={[s.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={s.sectionTitle}>ACTIVITY LOG</Text>

      {recent.length > 0 ? (
        recent.map((l, i) => (
          <LogEntry
            key={l.id}
            time={formatTime(l.timestamp)}
            label={`${formatAmount(l.amountMg, l.substanceType)}  ${l.label.toUpperCase()}`}
            detail={l.substanceType.toUpperCase()}
            c={substanceColor(l.substanceType)}
            isLast={i === recent.length - 1}
          />
        ))
      ) : (
        <Text style={s.emptyHint}>NO ACTIVITY YET  ·  LOG TO POPULATE</Text>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container:    { paddingHorizontal: space.xl, marginBottom: space.xxl },
  sectionTitle: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.wide, color: color.textMid, marginBottom: space.lg },
  entry:  { flexDirection: 'row', gap: space.md },
  dotCol: { alignItems: 'center', width: 36 },
  dotRing: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  dot: { width: 8, height: 8, borderRadius: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 4 },
  connector: { width: 2, flex: 1, minHeight: 12, borderRadius: 1, marginVertical: 2 },
  card: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: alpha(color.text, 0.06),
    backgroundColor: alpha(color.text, 0.02), paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 3 },
  timeText:   { fontFamily: font.mono, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  separator:  { fontFamily: font.mono, fontSize: 11, color: color.textMid },
  labelText:  { fontFamily: font.mono, fontSize: 11, fontWeight: '600', letterSpacing: 1, color: color.text },
  detailText: { fontFamily: font.mono, fontSize: T.label, letterSpacing: 2, color: color.textMid },
  emptyHint:  { fontFamily: font.mono, fontSize: T.micro, letterSpacing: tracking.label, color: color.textDim, textAlign: 'center', marginTop: space.xs },
});
