// =============================================================================
// app/(tabs)/inject.tsx — LOG INTAKE
// Frictionless, honestly-named intake logging. (Route kept as /inject to avoid
// router churn; the UI says "LOG".) Three core engines: caffeine, sugar, sodium.
// Each card offers adjustable dose presets + a one-tap log with inline confirm.
// =============================================================================

import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBioStore } from '../../src/store/useBioStore';
import { saveHealthKitSugar } from '../../lib/health';
import { color, font, type as T, space, tracking, alpha } from '../../src/theme/tokens';

// ─── Substance registry ───────────────────────────────────────────────────────
// Single source of truth. Adding a substance needs only a new entry here —
// the UI, log handler, and HealthKit dispatch all derive from this record.

interface DosePreset { label: string; mg: number }

interface SubstanceConfig {
  id:             string;
  label:          string;
  sublabel:       string;
  desc:           string;            // honest mechanism copy — no fake decay claims
  unit:           string;            // display unit
  displayInGrams: boolean;           // divide mg by 1000 for display
  presets:        DosePreset[];      // selectable doses
  defaultIdx:     number;            // initially-selected preset
  color:          string;
  substanceType:  'caffeine' | 'sugar' | 'sodium' | 'other';
  healthKitWrite: 'sugar' | null;
}

const SUBSTANCES: SubstanceConfig[] = [
  {
    id: 'caffeine', label: 'CAFFEINE', sublabel: 'NEURAL STIMULANT',
    desc: 'ADENOSINE BLOCKER  ·  5.7H HALF-LIFE',
    unit: 'MG', displayInGrams: false,
    presets: [{ label: 'ESPRESSO', mg: 63 }, { label: 'DRIP', mg: 95 }, { label: 'ENERGY', mg: 160 }],
    defaultIdx: 1, color: color.primary, substanceType: 'caffeine', healthKitWrite: null,
  },
  {
    id: 'sugar', label: 'SUGAR', sublabel: 'GLYCEMIC LOAD',
    desc: 'ENERGY SPIKE  ·  ~45–90M WINDOW',
    unit: 'G', displayInGrams: true,
    presets: [{ label: 'SNACK', mg: 15_000 }, { label: 'SODA', mg: 39_000 }, { label: 'MEAL', mg: 50_000 }],
    defaultIdx: 1, color: color.energy, substanceType: 'sugar', healthKitWrite: 'sugar',
  },
  {
    id: 'sodium', label: 'SODIUM', sublabel: 'ELECTROLYTE LOAD',
    desc: 'HYDRATION  ·  DAILY CUMULATIVE',
    unit: 'MG', displayInGrams: false,
    presets: [{ label: 'PINCH', mg: 200 }, { label: 'MEAL', mg: 600 }, { label: 'SALTY', mg: 1_000 }],
    defaultIdx: 1, color: color.sodium, substanceType: 'sodium', healthKitWrite: null,
  },
];

function fmtDose(mg: number, displayInGrams: boolean, unit: string): string {
  return displayInGrams ? `${mg / 1_000}${unit}` : `${mg}${unit}`;
}

// ─── Substance card ───────────────────────────────────────────────────────────

interface CardProps {
  substance:   SubstanceConfig;
  selectedMg:  number;
  onSelect:    (mg: number) => void;
  onLog:       () => void;
  isFlashing:  boolean;
}

function SubstanceCard({ substance, selectedMg, onSelect, onLog, isFlashing }: CardProps) {
  const c = substance.color;
  return (
    <View style={[s.card, { borderColor: alpha(c, 0.33) }]}>
      {/* Flash overlay */}
      <View pointerEvents="none" style={[s.flash, { backgroundColor: c, opacity: isFlashing ? 0.12 : 0 }]} />

      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={[s.sublabel, { color: alpha(c, 0.6) }]}>{substance.sublabel}</Text>
          <Text style={[s.label, { color: c }]}>{substance.label}</Text>
          <Text style={s.desc}>{substance.desc}</Text>
        </View>
      </View>

      {/* Dose preset chips */}
      <View style={s.chipRow}>
        {substance.presets.map((p) => {
          const active = p.mg === selectedMg;
          return (
            <Pressable
              key={p.label}
              onPress={() => { void Haptics.selectionAsync(); onSelect(p.mg); }}
              style={[
                s.chip,
                active
                  ? { borderColor: c, backgroundColor: alpha(c, 0.12) }
                  : { borderColor: color.border, backgroundColor: 'transparent' },
              ]}
            >
              <Text style={[s.chipLabel, { color: active ? c : color.textMid }]}>{p.label}</Text>
              <Text style={[s.chipDose, { color: active ? alpha(c, 0.8) : color.textDim }]}>
                {fmtDose(p.mg, substance.displayInGrams, substance.unit)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Log action */}
      <Pressable
        onPress={onLog}
        accessibilityRole="button"
        accessibilityLabel={`Log ${substance.label}`}
        style={({ pressed }) => [s.logBtn, { borderColor: c, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={[s.logBtnText, { color: c }]}>
          {isFlashing ? '✓  LOGGED' : `LOG  ${fmtDose(selectedMg, substance.displayInGrams, substance.unit)}`}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── LOG screen ───────────────────────────────────────────────────────────────

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const addLog = useBioStore((state) => state.addLog);

  const [selected, setSelected] = useState<Record<string, number>>(() =>
    Object.fromEntries(SUBSTANCES.map((sub) => [sub.id, sub.presets[sub.defaultIdx].mg])),
  );
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitting = useRef(false);

  const handleLog = useCallback((substance: SubstanceConfig, amount: number) => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    try {
      // Local store write (safety gate lives inside addLog)
      const prevCount = useBioStore.getState().logs.length;
      addLog({
        label:         substance.label,
        substanceType: substance.substanceType,
        amountMg:      amount,
        timestamp:     Date.now(),
      });
      // If count didn't grow, the store's safety gate rejected the dose.
      if (useBioStore.getState().logs.length === prevCount) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        isSubmitting.current = false;
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // HealthKit write (fire-and-forget, data-driven)
      if (substance.healthKitWrite === 'sugar') {
        saveHealthKitSugar(amount / 1_000, Date.now()).catch(() => {});
      }

      // Inline confirm — no interrupting Alert
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setFlashingId(substance.id);
      timeoutRef.current = setTimeout(() => setFlashingId(null), 1_400);
    } finally {
      isSubmitting.current = false;
    }
  }, [addLog]);

  return (
    <SafeAreaView style={[s.root, { paddingBottom: insets.bottom + 72 }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ gap: 2 }}>
          <Text style={s.eyebrow}>LOG INTAKE</Text>
          <Text style={s.title}>LOG</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.statusPill}>
            <View style={s.statusDot} />
            <Text style={s.statusLabel}>READY</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            style={s.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Text style={s.closeBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.divider} />

      {/* Substance cards */}
      <View style={s.cards}>
        {SUBSTANCES.map((sub) => (
          <SubstanceCard
            key={sub.id}
            substance={sub}
            selectedMg={selected[sub.id]}
            onSelect={(mg) => setSelected((prev) => ({ ...prev, [sub.id]: mg }))}
            onLog={() => handleLog(sub, selected[sub.id])}
            isFlashing={flashingId === sub.id}
          />
        ))}
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>SELECT A DOSE  ·  TAP LOG  ·  HAPTIC CONFIRM</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.md,
  },
  eyebrow: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.textMid },
  title:   { fontFamily: font.mono, fontSize: T.h1, fontWeight: '200', letterSpacing: 1, color: color.text },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderWidth: 1, borderColor: alpha(color.ready, 0.2), borderRadius: 20,
    paddingHorizontal: space.md, paddingVertical: 5, backgroundColor: alpha(color.ready, 0.06),
  },
  statusDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ready },
  statusLabel: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, color: color.ready, fontWeight: '700' },
  divider: { height: 1, backgroundColor: color.border, marginHorizontal: space.xxl, marginBottom: space.md },

  cards: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  card: {
    flex: 1, borderRadius: 20, borderWidth: 0.5, backgroundColor: color.surface,
    padding: space.lg, overflow: 'hidden', justifyContent: 'space-between',
  },
  flash: { ...StyleSheet.absoluteFillObject },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  sublabel: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, fontWeight: '400' },
  label:    { fontFamily: font.mono, fontSize: 26, fontWeight: '200', letterSpacing: 0, marginTop: 2 },
  desc:     { fontFamily: font.mono, fontSize: T.micro, letterSpacing: 2, color: color.textMid, marginTop: space.xs },

  chipRow: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  chip: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: space.sm, alignItems: 'center', gap: 2,
  },
  chipLabel: { fontFamily: font.mono, fontSize: T.label, letterSpacing: tracking.label, fontWeight: '400' },
  chipDose:  { fontFamily: font.mono, fontSize: T.micro, letterSpacing: 1 },

  logBtn: {
    borderWidth: 1.5, borderRadius: 14, paddingVertical: space.md, alignItems: 'center',
  },
  logBtnText: { fontFamily: font.mono, fontSize: T.h2, fontWeight: '500', letterSpacing: tracking.label },

  footer: { paddingHorizontal: space.xxl, paddingVertical: space.md, alignItems: 'center' },
  footerText: { fontFamily: font.mono, fontSize: T.micro, letterSpacing: 2.5, color: color.textDim, textAlign: 'center' },

  closeBtn: {
    marginLeft: space.md, width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    borderColor: alpha(color.alert, 0.4), backgroundColor: alpha(color.alert, 0.06),
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: font.mono, fontSize: 13, fontWeight: '700', color: color.alert, lineHeight: 16 },
});
