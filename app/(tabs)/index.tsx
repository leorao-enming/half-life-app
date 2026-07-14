import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NightMap } from '../../components/NightMap';
import { SipTrace } from '../../components/SipTrace';
import { CaffeineWeather } from '../../components/CaffeineWeather';
import { GlassPressable } from '../../components/GlassPressable';
import { useCaffeineSnapshot } from '../../hooks/useCaffeineSnapshot';
import { targetSleepAt, USUAL_COFFEE_MG } from '../../src/domain/caffeine';
import { useBioStore } from '../../src/store/useBioStore';
import { alpha, color, font, space } from '../../src/theme/tokens';
import { fmtClock } from '../../src/utils/energyState';

function minutesUntil(timeMs: number | null, nowMs: number): string {
  if (!timeMs) return 'Low-impact window is open now';
  const minutes = Math.max(0, Math.round((timeMs - nowMs) / 60_000));
  if (minutes < 60) return `${minutes} min later`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m ` : ''}later`;
}

export default function TonightScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { activeMg, halfLifeHours, logs, nowMs, readyAtMs } = useCaffeineSnapshot();
  const caffeinePlan = useBioStore((state) => state.profile.caffeinePlan ?? { wakeTime: '07:30', hasLateDeadline: false });
  const hasCaffeine = useMemo(() => logs.some((log) => log.substanceType === 'caffeine'), [logs]);
  const contentWidth = width - space.xl * 2;
  const targetSleepAtMs = targetSleepAt(caffeinePlan.wakeTime, nowMs);
  const date = new Date(nowMs).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const snapDrink = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/inject');
  }, []);

  const addUsualCoffee = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useBioStore.getState().addLog({
      label: 'Coffee', substanceType: 'caffeine', amountMg: USUAL_COFFEE_MG, timestamp: Date.now(),
    });
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 108 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerTitle}><Text style={styles.screenName}>TONIGHT</Text><Text style={styles.date}>{date}</Text></View>
          <GlassPressable onPress={() => router.push('/lab')} accessibilityRole="button" accessibilityLabel="Set wake-up time and deadline" style={styles.headerPlan}>
            <Text style={styles.headerPlanText}>PLAN</Text>
          </GlassPressable>
        </View>

        <View style={styles.decision}>
          <Text style={styles.decisionLabel}>{readyAtMs ? 'Lower caffeine impact after' : 'Your low-impact window is'}</Text>
          <Text style={styles.decisionTime}>{readyAtMs ? fmtClock(readyAtMs) : 'OPEN'}</Text>
          <Text style={styles.decisionDetail}>{minutesUntil(readyAtMs, nowMs)}</Text>
        </View>

        <CaffeineWeather activeMg={activeMg} readyAtMs={readyAtMs} logs={logs} nowMs={nowMs} halfLifeHours={halfLifeHours} />

        <View style={styles.signalPanel}>
          <NightMap logs={logs} nowMs={nowMs} readyAtMs={readyAtMs} targetSleepAtMs={targetSleepAtMs} halfLifeHours={halfLifeHours} width={contentWidth - space.lg * 2} />
          <View style={styles.divider} />
          {hasCaffeine ? <SipTrace logs={logs} halfLifeHours={halfLifeHours} nowMs={nowMs} width={contentWidth - space.lg * 2} /> : (
            <View style={styles.emptyTrace}><Text style={styles.emptyTraceTitle}>YOUR SIP TRACE</Text><Text style={styles.emptyTraceBody}>Record a drink to see its estimated fade through tonight.</Text></View>
          )}
        </View>

        <GlassPressable onPress={snapDrink} accessibilityRole="button" accessibilityLabel="Snap or record a drink" style={styles.primaryButton} selected>
          <Ionicons name="camera-outline" size={22} color={color.primary} />
          <Text style={styles.primaryButtonText}>Snap a drink</Text>
        </GlassPressable>
        <GlassPressable onPress={addUsualCoffee} accessibilityRole="button" accessibilityLabel="Add a usual coffee with 95 milligrams of caffeine" style={styles.usualCoffee}>
          <Text style={styles.usualCoffeeText}>ADD USUAL COFFEE · {USUAL_COFFEE_MG} MG</Text>
        </GlassPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.md },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 48 },
  headerTitle: { alignItems: 'center' },
  screenName: { color: color.text, fontFamily: font.mono, fontSize: 14, letterSpacing: 1.6 },
  date: { color: color.textMid, fontSize: 13, marginTop: 5 },
  headerPlan: { width: 48, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerPlanText: { color: color.primary, fontFamily: font.mono, fontSize: 10, fontWeight: '700', letterSpacing: .8 },
  decision: { alignItems: 'center', paddingTop: space.xxxl + 4, paddingBottom: space.xxl },
  decisionLabel: { color: color.text, fontSize: 24, lineHeight: 31, textAlign: 'center', maxWidth: 270 },
  decisionTime: { color: color.primary, fontSize: 66, fontWeight: '200', letterSpacing: -2, lineHeight: 78, fontVariant: ['tabular-nums'] },
  decisionDetail: { color: color.primary, fontSize: 14, marginTop: 2 },
  signalPanel: { backgroundColor: alpha(color.surfaceHi, .58), borderWidth: 1, borderColor: alpha(color.text, .18), borderRadius: 17, padding: space.lg, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: color.border, marginVertical: space.md },
  emptyTrace: { minHeight: 126, justifyContent: 'center' },
  emptyTraceTitle: { color: color.primary, fontFamily: font.mono, fontSize: 12, letterSpacing: 1.1 },
  emptyTraceBody: { color: color.textMid, fontSize: 14, lineHeight: 20, marginTop: space.sm, maxWidth: 250 },
  primaryButton: { minHeight: 56, marginTop: space.lg, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primaryButtonText: { color: color.primary, fontSize: 17, fontWeight: '700' },
  usualCoffee: { minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  usualCoffeeText: { color: color.textMid, fontFamily: font.mono, fontSize: 12, letterSpacing: .6 },
});
