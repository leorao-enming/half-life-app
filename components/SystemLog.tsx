import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useBioStore } from '../src/store/useBioStore';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const C = {
  NEON_G:  '#39FF14',
  ELEC_B:  '#0FF0FC',
  NEON_Y:  '#FFFF33',
  BLOOD_R: '#FF073A',
  TEXT:    '#FFFFFF',
  MID:     '#555555',
  DIM:     '#2A2A2A',
  BORDER:  '#1A1A1A',
} as const;

function substanceColor(type: string): string {
  switch (type) {
    case 'caffeine': return C.ELEC_B;
    case 'sugar':    return C.NEON_Y;
    case 'sodium':   return C.NEON_G;
    default:         return C.BLOOD_R;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatAmount(amountMg: number, type: string): string {
  if (type === 'sugar' || type === 'other') {
    return amountMg >= 1000 ? `${(amountMg / 1000).toFixed(0)}g` : `${amountMg}mg`;
  }
  return `${amountMg}mg`;
}

// ── Log entry ─────────────────────────────────────────────────────────────────

interface LogEntryProps {
  time: string;
  label: string;
  detail: string;
  color: string;
  isLast: boolean;
}

function LogEntry({ time, label, detail, color, isLast }: LogEntryProps) {
  return (
    <View style={s.entry}>
      {/* Timeline dot + line */}
      <View style={s.dotCol}>
        <View style={[s.dotRing, { borderColor: `${color}55`, backgroundColor: '#0A0A0A' }]}>
          <View style={[s.dot, { backgroundColor: color, shadowColor: color }]} />
        </View>
        {!isLast && (
          <View style={[s.connector, { backgroundColor: `${color}30` }]} />
        )}
      </View>

      {/* Content card */}
      <View style={s.card}>
        <View style={s.cardTop}>
          <Text style={[s.timeText, { color }]}>{time}</Text>
          <Text style={s.separator}>|</Text>
          <Text style={s.labelText}>{label}</Text>
        </View>
        <Text style={s.detailText}>{detail}</Text>
      </View>
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function SystemLog() {
  const logs = useBioStore((state) => state.logs);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  // Empty dep array → runs exactly once on mount (fadeAnim/slideAnim are
  // stable Animated.Value refs from useRef — never change between renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Show latest 5 entries, most recent first
  const recent = [...logs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  // Fallback demo entries when store is empty
  const entries =
    recent.length > 0
      ? recent.map((l) => ({
          time:   formatTime(l.timestamp),
          label:  `${formatAmount(l.amountMg, l.substanceType)}  ${l.label.toUpperCase()}`,
          detail: l.substanceType.toUpperCase(),
          color:  substanceColor(l.substanceType),
        }))
      : [
          { time: '14:00', label: '200MG  CAFFEINE',  detail: 'PRE-WORKOUT',       color: C.ELEC_B  },
          { time: '09:00', label: '5G  CREATINE',     detail: 'SATURATION PHASE',  color: C.BLOOD_R },
          { time: '07:30', label: '100MG  CAFFEINE',  detail: 'MORNING BOOST',     color: C.ELEC_B  },
        ];

  return (
    <Animated.View
      style={[s.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      <Text style={s.sectionTitle}>SYSTEM LOG</Text>

      {entries.map((e, i) => (
        <LogEntry
          key={i}
          time={e.time}
          label={e.label}
          detail={e.detail}
          color={e.color}
          isLast={i === entries.length - 1}
        />
      ))}

      {recent.length === 0 && (
        <Text style={s.emptyHint}>DEMO DATA  ·  INJECT TO POPULATE</Text>
      )}
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    color: C.MID,
    marginBottom: 16,
  },
  entry: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 0,
  },
  dotCol: {
    alignItems: 'center',
    width: 36,
  },
  dotRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 12,
    borderRadius: 1,
    marginTop: 2,
    marginBottom: 2,
  },
  card: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  timeText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  separator: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.MID,
  },
  labelText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: C.TEXT,
  },
  detailText: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 2,
    color: C.MID,
  },
  emptyHint: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 3,
    color: C.DIM,
    textAlign: 'center',
    marginTop: 4,
  },
});
