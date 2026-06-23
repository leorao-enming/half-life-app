import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
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
import { HALF_LIVES } from '../src/utils/kinetics';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAFFEINE_CLEAR_MG = 5;

function clearanceSecs(mg: number, halfLifeH: number): number {
  if (mg <= CAFFEINE_CLEAR_MG) return 0;
  return Math.round(halfLifeH * Math.log2(mg / CAFFEINE_CLEAR_MG) * 3_600);
}

function formatSleepWindow(secs: number): string {
  if (secs <= 0) return 'Open Now';
  const target = new Date(Date.now() + secs * 1_000);
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  return `Opens ${hh}:${mm}`;
}

function getTrainingLabel(sodiumMg: number): string {
  const pct = sodiumMg / 2_300;
  if (pct > 0.60) return 'Prime Pump Level';
  if (pct > 0.25) return 'Building Load';
  return 'Baseline State';
}

// ── Moon icon (Deep Sleep) ───────────────────────────────────────────────────

function MoonIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Bolt icon (Training Readiness) ───────────────────────────────────────────

function BoltIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Window card ───────────────────────────────────────────────────────────────

interface WindowCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
}

function WindowCard({ icon, label, value, accentColor }: WindowCardProps) {
  return (
    <View
      style={[
        s.cardOuter,
        {
          borderColor: `${accentColor}20`,
          shadowColor: accentColor,
        },
      ]}
    >
      <View style={s.cardInner}>
        <View
          style={[s.cornerGlow, { backgroundColor: `${accentColor}18` }]}
        />
        <View style={s.iconRow}>
          {icon}
          <Text style={s.label}>{label}</Text>
        </View>
        <Text
          style={[
            s.value,
            { textShadowColor: `${accentColor}40`, textShadowRadius: 8 },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function OptimalWindows() {
  // ── Stable selectors — no Date.now() inside, safe for Zustand ──────────────
  //
  // CRITICAL: Selectors must return primitive scalars or stable array/object
  // references. Never return new arrays/objects directly from a selector —
  // useSyncExternalStore will see a "new" snapshot every call and loop.
  const logs          = useBioStore(selectAllLogs);
  const cafFactor     = useBioStore(selectCafFactor);
  const sodiumFactor  = useBioStore(selectSodiumFactor);
  const healthKitMult = useBioStore(selectHealthKitMultiplier);

  // ── nowMs ticks every second; drives all time-based computations ────────────
  // Date.now() MUST NOT be called inside a Zustand selector — it advances
  // every ms so useSyncExternalStore always sees a "new" value → infinite loop.
  // Safe pattern: maintain nowMs in local state, updated via setInterval.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
    // Empty deps: interval is set up once on mount, cleared on unmount.
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

  // Empty dep array → runs exactly once on mount.
  // fadeAnim / slideAnim are stable Animated.Value instances from useRef —
  // identical references across every re-render — so [] is semantically
  // equivalent to [fadeAnim, slideAnim] but more explicit about "run once".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const hl            = (HALF_LIVES.CAFFEINE / cafFactor) * (1 / healthKitMult);
  const clearSecs     = clearanceSecs(activeCaffeine, hl);
  const sleepValue    = formatSleepWindow(clearSecs);
  const trainingValue = getTrainingLabel(activeSodium);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
    >
      <View style={s.container}>
        <View style={s.grid}>
          <WindowCard
            icon={<MoonIcon color="#39FF14" />}
            label="DEEP SLEEP WINDOW"
            value={sleepValue}
            accentColor="#39FF14"
          />
          <WindowCard
            icon={<BoltIcon color="#0FF0FC" />}
            label="TRAINING READINESS"
            value={trainingValue}
            accentColor="#0FF0FC"
          />
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  cardOuter: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 14,
    elevation: 4,
  },
  cardInner: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
    gap: 10,
  },
  cornerGlow: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontFamily: MONO,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#555555',
    flex: 1,
    flexWrap: 'wrap',
  },
  value: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    color: '#E8E8E8',
    lineHeight: 20,
  },
});
