// =============================================================================
// app/(tabs)/lab.tsx — PLAN
// Phase 6.1: a safe, user-facing planning placeholder. The previous Lab screen
// exposed environment diagnostics and authentication internals, which do not
// belong in the product experience.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurfewStamp } from '../../components/CurfewStamp';
import { GlassPressable } from '../../components/GlassPressable';
import { color, font, space, alpha } from '../../src/theme/tokens';
import { buildCurfewPlan } from '../../src/domain/caffeine';
import { useCaffeineSnapshot } from '../../hooks/useCaffeineSnapshot';
import { useBioStore } from '../../src/store/useBioStore';
import { buildDailyCurfewStamp } from '../../src/domain/patterns';
import { initHealthKit } from '../../lib/health';

const WAKE_TIMES = ['06:30', '07:30', '08:30'];
const DEFAULT_PLAN = { wakeTime: '07:30', hasLateDeadline: false };

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const plan = useBioStore((state) => state.profile.caffeinePlan ?? DEFAULT_PLAN);
  const updateBioProfile = useBioStore((state) => state.updateBioProfile);
  const { halfLifeHours, logs, nowMs } = useCaffeineSnapshot();
  const [healthStatus, setHealthStatus] = useState('Not connected');

  const curfew = useMemo(() => {
    return buildCurfewPlan(plan.wakeTime, plan.hasLateDeadline, halfLifeHours);
  }, [halfLifeHours, plan.hasLateDeadline, plan.wakeTime]);
  const todayStamp = useMemo(() => buildDailyCurfewStamp(logs, nowMs), [logs, nowMs]);

  const connectHealth = async () => {
    if (Platform.OS !== 'ios') {
      setHealthStatus('Apple Health is available on iPhone and iPad only');
      return;
    }

    setHealthStatus('Requesting access…');
    const { status, multiplier } = await initHealthKit();
    if (!status.authorized) {
      setHealthStatus(status.error ?? 'Access not granted');
      return;
    }

    useBioStore.getState().setHealthKitMultiplier(multiplier);
    setHealthStatus('Connected — estimate personalized on this device');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}><Text style={s.title}>PLAN</Text><Text style={s.subtitle}>Set your curfew.</Text></View>

        <View style={s.splitCard}>
          <View style={s.splitColumn}>
            <Text style={s.cardLabel}>WAKE-UP TIME</Text>
            <Text style={s.splitHint}>Tomorrow</Text>
            <Text style={s.splitTime}>{plan.wakeTime}</Text>
            <Ionicons name="sunny-outline" size={19} color={color.textMid} style={s.splitIcon} />
          </View>
          <View style={s.splitDivider} />
          <GlassPressable
            accessibilityRole="switch"
            accessibilityState={{ checked: plan.hasLateDeadline }}
            onPress={() => {
              void Haptics.selectionAsync();
              updateBioProfile({ caffeinePlan: { ...plan, hasLateDeadline: !plan.hasLateDeadline } });
            }}
            style={s.deadlineButton}
            selected={plan.hasLateDeadline}
          >
            <Text style={s.cardLabel}>DEADLINE</Text>
            <Text style={[s.splitHint, plan.hasLateDeadline && s.deadlineOn]}>{plan.hasLateDeadline ? 'Late work' : 'None set'}</Text>
            <Text style={[s.splitTime, plan.hasLateDeadline && s.deadlineTime]}>{plan.hasLateDeadline ? 'ON' : '—'}</Text>
            <Ionicons name="moon-outline" size={19} color={plan.hasLateDeadline ? color.energy : color.textMid} style={s.splitIcon} />
          </GlassPressable>
        </View>

        <View style={s.wakePicker}>
          <Text style={s.cardLabel}>CHOOSE WAKE-UP</Text>
          <View style={s.options}>
            {WAKE_TIMES.map((time) => {
              const selected = time === plan.wakeTime;
              return (
                <GlassPressable
                  key={time}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Wake at ${time}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    updateBioProfile({ caffeinePlan: { ...plan, wakeTime: time } });
                  }}
                  style={s.option}
                  selected={selected}
                >
                  <Text style={[s.optionText, selected && s.optionTextSelected]}>{time}</Text>
                </GlassPressable>
              );
            })}
          </View>
        </View>

        <View style={s.curfewCard}>
          <Text style={s.cardLabel}>YOUR CAFFEINE CURFEW</Text>
          <View style={s.checkRow}><Ionicons name="checkmark-circle" size={25} color={color.primary} /><View><Text style={s.checkTitle}>Last high-impact drink</Text><Text style={s.checkSub}>Before {curfew.cutoffLabel}</Text></View></View>
          <View style={s.checkRow}><Ionicons name="checkmark-circle" size={25} color={color.primary} /><View><Text style={s.checkTitle}>Last moderate-impact drink</Text><Text style={s.checkSub}>Prefer an earlier, smaller option</Text></View></View>
          <View style={s.checkRow}><View style={s.openCircle} /><View><Text style={s.checkTitle}>Lower caffeine impact after</Text><Text style={[s.checkSub, s.curfewAccent]}>{curfew.cutoffLabel}</Text></View></View>
          <View style={s.checkRow}><View style={s.emptyCircle} /><View><Text style={s.checkTitle}>Protect your morning</Text><Text style={s.checkSub}>Stay hydrated, eat light, sleep well</Text></View></View>
        </View>

        <View style={s.stampCard}>
          <View><Text style={s.cardLabel}>TODAY’S CURFEW STAMP</Text><Text style={s.stampCopy}>{todayStamp.detail.title}{`\n`}{todayStamp.drinkCount ? `${todayStamp.detail.totalMg} mg from ${todayStamp.drinkCount} drink${todayStamp.drinkCount > 1 ? 's' : ''}` : 'No caffeine recorded yet'}</Text></View>
          <CurfewStamp detail={todayStamp.detail} size={82} />
        </View>

        <View style={s.privacyCard}>
          <Text style={s.cardLabel}>OPTIONAL CONNECTIONS</Text>
          <Text style={s.privacyCopy}>Apple Health is optional. Half-Life remains usable without it.</Text>
          <GlassPressable accessibilityRole="button" accessibilityLabel="Connect Apple Health" onPress={connectHealth} style={s.permissionButton}>
            <Ionicons name="heart-outline" size={18} color={color.primary} />
            <View style={s.permissionText}><Text style={s.permissionTitle}>APPLE HEALTH</Text><Text style={s.permissionDetail}>{healthStatus}</Text></View>
          </GlassPressable>
          <GlassPressable accessibilityRole="link" accessibilityLabel="Read privacy and data use" onPress={() => router.push('/privacy')} style={s.privacyLink}>
            <Text style={s.privacyLinkText}>Privacy &amp; data use</Text><Ionicons name="chevron-forward" size={16} color={color.textMid} />
          </GlassPressable>
        </View>
        <Text style={s.estimate}>Estimated guidance · not medical advice · {curfew.rationale}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md },
  header: { alignItems: 'center', paddingBottom: space.md },
  title: { color: color.text, fontFamily: font.mono, fontSize: 14, letterSpacing: 1.5, fontWeight: '500' },
  subtitle: { color: color.textMid, fontSize: 13, marginTop: 6 },
  cardLabel: { color: color.textMid, fontFamily: font.mono, fontSize: 11, fontWeight: '500', letterSpacing: .9 },
  splitCard: { minHeight: 138, flexDirection: 'row', borderWidth: 1, borderColor: alpha(color.primary, .58), borderRadius: 17, backgroundColor: alpha(color.surfaceHi, .48), paddingVertical: space.md },
  splitColumn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deadlineButton: { flex: 1, borderRadius: 13, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  splitDivider: { width: 1, backgroundColor: color.border, marginVertical: space.sm },
  splitHint: { color: color.textMid, fontSize: 12, marginTop: 5 },
  deadlineOn: { color: color.energy },
  splitTime: { color: color.text, fontSize: 31, fontWeight: '300', lineHeight: 38, fontVariant: ['tabular-nums'], marginTop: 5 },
  deadlineTime: { color: color.energy },
  splitIcon: { marginTop: 7 },
  wakePicker: { paddingVertical: space.md },
  options: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  option: { minHeight: 45, flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 13 },
  optionText: { color: color.textMid, fontSize: 16, fontWeight: '600' },
  optionTextSelected: { color: color.primary },
  curfewCard: { borderRadius: 16, padding: space.lg, borderWidth: 1, borderColor: alpha(color.text, .2), backgroundColor: alpha(color.surfaceHi, .42) },
  checkRow: { minHeight: 61, flexDirection: 'row', gap: space.md, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: color.border },
  checkTitle: { color: color.text, fontSize: 14, lineHeight: 19 },
  checkSub: { color: color.textMid, fontSize: 13, marginTop: 2 },
  curfewAccent: { color: color.energy },
  openCircle: { width: 25, height: 25, borderRadius: 13, borderColor: color.energy, borderWidth: 1.5 },
  emptyCircle: { width: 25, height: 25, borderRadius: 13, borderColor: color.textMid, borderWidth: 1.5 },
  stampCard: { minHeight: 98, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, paddingLeft: space.lg, paddingRight: 10, borderWidth: 1, borderColor: alpha(color.text, .2), backgroundColor: alpha(color.surfaceHi, .38) },
  stampCopy: { color: color.textMid, fontSize: 13, lineHeight: 19, marginTop: 7 },
  privacyCard: { borderRadius: 16, padding: space.lg, borderWidth: 1, borderColor: alpha(color.text, .2), backgroundColor: alpha(color.surfaceHi, .38), gap: space.sm },
  privacyCopy: { color: color.textMid, fontSize: 13, lineHeight: 19 },
  permissionButton: { minHeight: 58, borderRadius: 12, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  permissionText: { flex: 1 },
  permissionTitle: { color: color.text, fontFamily: font.mono, fontSize: 11, letterSpacing: .7 },
  permissionDetail: { color: color.textMid, fontSize: 12, marginTop: 3 },
  privacyLink: { minHeight: 40, paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privacyLinkText: { color: color.textMid, fontSize: 13, textDecorationLine: 'underline' },
  estimate: { color: color.textDim, fontSize: 12, lineHeight: 18, marginBottom: space.md },
});
