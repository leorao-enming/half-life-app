import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import {
  useBioStore,
  selectAllLogs,
  selectCafFactor,
  selectSodiumFactor,
  selectHealthKitMultiplier,
  computeActiveCaffeine,
  computeActiveBySubstance,
} from '../src/store/useBioStore';
import { effectiveCaffeineHalfLife, sleepReadyAt, fmtClock } from '../src/utils/energyState';
import { color, font, type as T, space, tracking, alpha } from '../src/theme/tokens';

const SODIUM_LIMIT_MG = 2_300;

function getTrainingLabel(sodiumMg: number): string {
  const pct = sodiumMg / SODIUM_LIMIT_MG;
  if (pct > 0.60) return 'Prime Pump';
  if (pct > 0.25) return 'Building Load';
  return 'Baseline';
}

function MoonIcon({ stroke }: { stroke: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function BoltIcon({ stroke }: { stroke: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

interface WindowCardProps { icon: React.ReactNode; label: string; value: string; accent: string }

function WindowCard({ icon, label, value, accent }: WindowCardProps) {
  return (
    <View style={[s.cardOuter, { borderColor: alpha(accent, 0.2), shadowColor: accent }]}>
      <View style={s.cardInner}>
        <View style={[s.cornerGlow, { backgroundColor: alpha(accent, 0.1) }]} />
        <View style={s.iconRow}>
          {icon}
          <Text style={s.label}>{label}</Text>
        </View>
        <Text style={[s.value, { textShadowColor: alpha(accent, 0.25), textShadowRadius: 8 }]}>{value}</Text>
      </View>
    </View>
  );
}

export function OptimalWindows() {
  const logs          = useBioStore(selectAllLogs);
  const cafFactor     = useBioStore(selectCafFactor);
  const sodiumFactor  = useBioStore(selectSodiumFactor);
  const healthKitMult = useBioStore(selectHealthKitMultiplier);

  // nowMs ticks every second — never call Date.now() inside a Zustand selector
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const activeCaffeine = useMemo(
    () => computeActiveCaffeine(logs, cafFactor, healthKitMult, nowMs),
    [logs, cafFactor, healthKitMult, nowMs],
  );
  const activeSodium = useMemo(
    () => computeActiveBySubstance(logs, 'sodium', sodiumFactor, nowMs),
    [logs, sodiumFactor, nowMs],
  );

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const halfLife   = effectiveCaffeineHalfLife(cafFactor, healthKitMult);
  const readyAt    = sleepReadyAt(activeCaffeine, halfLife, nowMs);
  const sleepValue = readyAt ? `Opens ${fmtClock(readyAt)}` : 'Open Now';

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={s.container}>
        <View style={s.grid}>
          <WindowCard icon={<MoonIcon stroke={color.ready} />}  label="DEEP SLEEP WINDOW"  value={sleepValue} accent={color.ready} />
          <WindowCard icon={<BoltIcon stroke={color.sodium} />} label="TRAINING READINESS" value={getTrainingLabel(activeSodium)} accent={color.sodium} />
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: space.xl, marginBottom: space.xl },
  grid:      { flexDirection: 'row', gap: space.md },
  cardOuter: {
    flex: 1, borderRadius: 16, borderWidth: 1, backgroundColor: color.surface,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 4,
  },
  cardInner: { flex: 1, borderRadius: 16, overflow: 'hidden', padding: space.lg, gap: space.md },
  cornerGlow: { position: 'absolute', top: -10, right: -10, width: 60, height: 60, borderRadius: 30 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontFamily: font.mono, fontSize: T.micro, fontWeight: '700', letterSpacing: 2, color: color.textMid, flex: 1, flexWrap: 'wrap' },
  value: { fontFamily: font.mono, fontSize: T.h2, fontWeight: '200', color: color.text, lineHeight: 20 },
});
