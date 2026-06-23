import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBioStore } from '../../src/store/useBioStore';
import { saveHealthKitSugar } from '../../lib/health';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  BG:      '#050505',
  SURFACE: '#0A0A0A',
  BORDER:  '#1A1A1A',
  BLUE:    '#00B4FF',
  YELLOW:  '#FFD600',
  PINK:    '#FF2D78',
  GREEN:   '#00FF87',
  TEXT:    '#FFFFFF',
  DIM:     '#2E2E2E',
  MID:     '#555555',
} as const;

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// ─── Substance Registry ───────────────────────────────────────────────────────
//
// Single source of truth for all injectable substances.
// Add new substances here — the UI, handler, and HealthKit dispatch all
// derive their behaviour exclusively from this record. No hardcoded branches.

export interface SubstanceConfig {
  id:             string;
  label:          string;
  sublabel:       string;
  desc:           string;
  unit:           string;
  /**
   * Canonical dose in mg (or mg-equivalent).
   *   Caffeine  100 mg  → stored as 100
   *   Sugar     10 g    → stored as 10_000 (mg-equivalent for store parity)
   *   Creatine  5 g     → stored as 5_000
   */
  dose:           number;
  /**
   * When true the display label divides dose by 1 000 (shows grams, not mg).
   * Keeps display logic data-driven — no `substanceType === 'sugar'` branches.
   */
  displayInGrams: boolean;
  color:          string;
  dimColor:       string;
  gradColors:     [string, string];
  substanceType:  'caffeine' | 'sugar' | 'sodium' | 'other';
  /**
   * If 'sugar', write the dose to Apple Health as Dietary Sugar on inject.
   * null = no HealthKit write for this substance.
   * Extend with additional string literals as more HealthKit types are added.
   */
  healthKitWrite: 'sugar' | null;
}

export const SUBSTANCE_CONFIG: Record<string, SubstanceConfig> = {
  caffeine: {
    id:             'caffeine',
    label:          'CAFFEINE',
    sublabel:       'NEURAL STIMULANT',
    desc:           'ADENOSINE BLOCKER  ·  HALF-LIFE 5.7H',
    unit:           'MG',
    dose:           100,
    displayInGrams: false,
    color:          C.BLUE,
    dimColor:       '#00264D',
    gradColors:     ['#001F3F', '#050505'],
    substanceType:  'caffeine',
    healthKitWrite: null,
  },
  sugar: {
    id:             'sugar',
    label:          'SUGAR',
    sublabel:       'GLUCOSE SPIKE',
    desc:           'GLYCAEMIC LOAD  ·  HALF-LIFE 1.5H',
    unit:           'G',
    dose:           10_000,
    displayInGrams: true,
    color:          C.YELLOW,
    dimColor:       '#3D2E00',
    gradColors:     ['#2A1F00', '#050505'],
    substanceType:  'sugar',
    healthKitWrite: 'sugar',
  },
  creatine: {
    id:             'creatine',
    label:          'CREATINE',
    sublabel:       'ATP REGENERATION',
    desc:           'PHOSPHOCREATINE POOL  ·  5G DOSE',
    unit:           'G',
    dose:           5_000,
    displayInGrams: true,
    color:          C.PINK,
    dimColor:       '#3D0015',
    gradColors:     ['#2A0010', '#050505'],
    substanceType:  'other',
    healthKitWrite: null,
  },
};

// Stable ordered array for rendering — derived from the record so the map
// never goes out of sync with the config.
const SUBSTANCE_LIST: SubstanceConfig[] = Object.values(SUBSTANCE_CONFIG);

// ─── InjectorBlock ────────────────────────────────────────────────────────────

interface InjectorBlockProps {
  substance:  SubstanceConfig;
  /** Receives substanceId + amount so it never holds a stale closure reference. */
  onInject:   (substanceId: string, amount: number) => void;
  isFlashing: boolean;
}

function InjectorBlock({ substance, onInject, isFlashing }: InjectorBlockProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onInject(substance.id, substance.dose);
  }, [substance.id, substance.dose, onInject]);

  // Display-safe dose string: data-driven via displayInGrams flag
  const doseDisplay = substance.displayInGrams
    ? `${substance.dose / 1_000}${substance.unit}`
    : `${substance.dose}${substance.unit}`;

  return (
    <View style={s.blockOuter}>
      <Pressable
        onPress={handlePress}
        style={s.blockPressable}
        accessibilityRole="button"
        accessibilityLabel={`Inject ${substance.label}`}
      >
        <LinearGradient
          colors={substance.gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.blockGradient}
        >
          {/* Border overlay */}
          <View style={[s.blockBorder, { borderColor: `${substance.color}55` }]} />

          {/* Flash feedback */}
          <View style={[s.blockFlash, { backgroundColor: substance.color, opacity: isFlashing ? 0.15 : 0 }]} />

          {/* Content */}
          <View style={s.blockContent}>
            {/* Left: labels */}
            <View style={s.blockLeft}>
              <Text style={[s.blockSublabel, { color: `${substance.color}88` }]}>
                {substance.sublabel}
              </Text>
              <Text style={[s.blockLabel, { color: substance.color }]}>
                {substance.label}
              </Text>
              <Text style={[s.blockDesc, { color: `${substance.color}55` }]}>
                {substance.desc}
              </Text>
            </View>

            {/* Right: dose pill */}
            <View style={[s.dosePill, { borderColor: `${substance.color}66`, backgroundColor: `${substance.color}10` }]}>
              <Text style={[s.doseValue, { color: substance.color }]}>
                {doseDisplay}
              </Text>
              <Text style={[s.doseTap, { color: `${substance.color}77` }]}>
                TAP
              </Text>
            </View>
          </View>

          {/* "LOGGED" flash state */}
          {isFlashing && (
            <View style={[s.loggedBanner, { backgroundColor: `${substance.color}18` }]}>
              <Text style={[s.loggedText, { color: substance.color }]}>
                ✓  LOGGED
              </Text>
            </View>
          )}

          {/* Corner tick marks (decorative) */}
          <View style={[s.cornerTL, { borderColor: `${substance.color}33` }]} />
          <View style={[s.cornerBR, { borderColor: `${substance.color}33` }]} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── Inject Screen ────────────────────────────────────────────────────────────

export default function InjectScreen() {
  // ── Debug: render counter (dev-only, silent in prod) ──────────────────────
  const renderCountRef = useRef(0);
  if (__DEV__) {
    renderCountRef.current += 1;
    console.log(`[injector] render #${renderCountRef.current}`);
  }

  const insets      = useSafeAreaInsets();
  const addLog      = useBioStore((state) => state.addLog);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-entry guard: prevents a second tap from firing while the first is
  // still in flight (stops the "Maximum update depth" cascade).
  // isSubmitting is a ref — updating it does NOT trigger a re-render.
  const isSubmitting = useRef(false);

  // ── Generic injection handler ─────────────────────────────────────────────
  //
  // ONE function handles ALL substances. The registry lookup replaces every
  // substance-specific branch: adding a new substance only requires a new
  // entry in SUBSTANCE_CONFIG above — this handler needs no edits.
  //
  // LOOP PREVENTION:
  //   a) isSubmitting ref gate — no double-submit
  //   b) addLog writes to local store only (no global refresh)
  //   c) HealthKit write is fire-and-forget (no setState in callback)
  //   d) No router.replace — user stays on this screen
  //   e) setFlashingId → only 1 local state update + auto-clear via timeout
  const handleInjection = useCallback(async (substanceId: string, amount: number) => {
    if (isSubmitting.current) {
      if (__DEV__) console.log('[injector] submit blocked — already in flight');
      return;
    }
    isSubmitting.current = true;
    if (__DEV__) console.log('[injector] submit start', substanceId, amount);

    const substance = SUBSTANCE_CONFIG[substanceId];
    if (!substance) {
      isSubmitting.current = false;
      return;
    }

    try {
      // ── 1. Local store write (synchronous, instant UI) ─────────────────
      const prevCount = useBioStore.getState().logs.length;

      addLog({
        label:         substance.label,
        substanceType: substance.substanceType,
        amountMg:      amount,
        timestamp:     Date.now(),
      });

      // If the count didn't grow, the store's safety gate rejected the dose.
      // The store already showed a BioHazard alert — just vibrate and bail.
      const nextCount = useBioStore.getState().logs.length;
      if (nextCount === prevCount) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (__DEV__) console.log('[injector] submit blocked by store safety gate');
        isSubmitting.current = false;
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ── 2. HealthKit sync (fire-and-forget, data-driven via config) ────
      // HealthKit writes are behind the substance.healthKitWrite flag.
      // No HealthKit init on boot — only triggered here on explicit inject.
      if (substance.healthKitWrite === 'sugar') {
        const amountGrams = amount / 1_000;
        saveHealthKitSugar(amountGrams, Date.now())
          .then((result) => {
            if (!result.saved && result.error && !result.error.includes('platform')) {
              console.warn('[injector] HealthKit sugar save failed:', result.error);
            }
          })
          .catch((err: unknown) => {
            console.warn(
              '[injector] saveHealthKitSugar threw:',
              err instanceof Error ? err.message : String(err),
            );
          });
      }

      // ── 3. Success feedback ────────────────────────────────────────────
      const doseDisplay = substance.displayInGrams
        ? `${amount / 1_000}${substance.unit}`
        : `${amount}${substance.unit}`;

      Alert.alert('✓ SUCCESS', `${doseDisplay} ${substance.label} recorded.`);

      // One local setState → shows flash banner, auto-clears after 1.5s.
      // Does NOT trigger any global re-render or navigation event.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setFlashingId(substanceId);
      timeoutRef.current = setTimeout(() => setFlashingId(null), 1_500);

    } catch (err: unknown) {
      // ── 4. Error boundary ──────────────────────────────────────────────
      // addLog handles Supabase errors internally. This catches unexpected
      // runtime throws and shows them instead of crashing the screen.
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Injection Failed', msg);
    } finally {
      isSubmitting.current = false;
      if (__DEV__) console.log('[injector] submit end', substanceId);
    }
  }, [addLog]);

  return (
    <SafeAreaView style={[s.root, { paddingBottom: insets.bottom + 72 }]} edges={['top', 'left', 'right']}>

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerEyebrow}>BIOHACK PROTOCOL</Text>
          <Text style={s.headerTitle}>THE INJECTOR</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.statusPill}>
            <View style={s.statusDot} />
            <Text style={s.statusLabel}>ARMED</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            style={s.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close injector"
            hitSlop={12}
          >
            <Text style={s.closeBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── Divider ─────────────────────────────────────────────────────── */}
      <View style={s.divider} />

      {/* ─── Substance blocks (data-driven from SUBSTANCE_CONFIG) ─────────── */}
      <View style={s.blocksContainer}>
        {SUBSTANCE_LIST.map((substance) => (
          <InjectorBlock
            key={substance.id}
            substance={substance}
            onInject={handleInjection}
            isFlashing={flashingId === substance.id}
          />
        ))}
      </View>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <Text style={s.footerText}>PRESS BLOCK TO RECORD INTAKE  ·  HAPTIC CONFIRM</Text>
      </View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.BG,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerLeft: {
    gap: 2,
  },
  headerEyebrow: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    color: C.MID,
  },
  headerTitle: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    color: C.TEXT,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#00FF8733',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#00FF8710',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.GREEN,
  },
  statusLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 3,
    color: C.GREEN,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: C.BORDER,
    marginHorizontal: 22,
    marginBottom: 10,
  },

  // Blocks
  blocksContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 10,
  },
  blockOuter: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#0A0A0A',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  blockPressable: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  blockGradient: {
    flex: 1,
    position: 'relative',
  },
  blockBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 18,
  },
  blockFlash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    borderRadius: 18,
  },
  blockContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  blockLeft: {
    flex: 1,
    gap: 4,
  },
  blockSublabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 4,
    fontWeight: '600',
  },
  blockLabel: {
    fontFamily: MONO,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 34,
  },
  blockDesc: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    marginTop: 2,
  },

  // Dose pill
  dosePill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
    minWidth: 60,
  },
  doseValue: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  doseTap: {
    fontFamily: MONO,
    fontSize: 7,
    letterSpacing: 3,
  },

  // Logged banner
  loggedBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  loggedText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 5,
  },

  // Corner tick marks (decorative)
  cornerTL: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 16,
    height: 16,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 16,
    height: 16,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },

  // Footer
  footer: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: MONO,
    fontSize: 7,
    letterSpacing: 2.5,
    color: C.DIM,
    textAlign: 'center',
  },

  // Close button
  closeBtn: {
    marginLeft: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF2D7844',
    backgroundColor: '#FF2D7810',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '700',
    color: '#FF2D78',
    lineHeight: 16,
  },
});
