// =============================================================================
// app/(tabs)/inject.tsx — RECORD A DRINK
// Phase 6.2: capture/choose a private drink photo, confirm an explainable local
// estimate, then preview the effect on tonight before the record is saved.
// =============================================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { selectAllLogs, useBioStore } from '../../src/store/useBioStore';
import { fmtClock } from '../../src/utils/energyState';
import { DOSE_OPTIONS, DRINK_OPTIONS, drinkImpact, formatImpact, type DrinkKind, type DrinkOption } from '../../src/domain/caffeine';
import { useCaffeineSnapshot } from '../../hooks/useCaffeineSnapshot';
import { color, space, alpha } from '../../src/theme/tokens';
import { GlassPressable } from '../../components/GlassPressable';

export default function RecordDrinkScreen() {
  const insets = useSafeAreaInsets();
  const logs = useBioStore(selectAllLogs);
  const { nowMs } = useCaffeineSnapshot();
  const cafFactor = useBioStore((state) => state.profile.metabolismFactors.caffeine);
  const healthKitMultiplier = useBioStore((state) => state.profile.healthKitMultiplier);
  const addLog = useBioStore((state) => state.addLog);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<DrinkKind>('coffee');
  const [dose, setDose] = useState(95);
  const savingRef = useRef(false);

  const selected = DRINK_OPTIONS.find((drink) => drink.id === selectedId) ?? DRINK_OPTIONS[0];
  const impact = useMemo(
    () => drinkImpact(logs, dose, cafFactor, healthKitMultiplier, nowMs),
    [cafFactor, dose, healthKitMultiplier, logs, nowMs],
  );

  const choosePhoto = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo access is optional',
        'You can still record a drink manually. Enable photo access in Settings whenever you want to attach a private drink photo.',
      );
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.45, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.45, exif: false });

    if (!result.canceled && result.assets[0]?.uri) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhotoUri(result.assets[0].uri);
    }
  };

  const selectDrink = (drink: DrinkOption) => {
    void Haptics.selectionAsync();
    setSelectedId(drink.id);
    setDose(drink.defaultDose);
  };

  const saveDrink = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const before = useBioStore.getState().logs.length;
    addLog({
      label: selected.label,
      substanceType: 'caffeine',
      amountMg: dose,
      timestamp: Date.now(),
      note: photoUri ? 'Private drink photo selected for this record.' : undefined,
      photoUri: photoUri ?? undefined,
    });

    if (useBioStore.getState().logs.length === before) {
      savingRef.current = false;
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close record drink" style={s.close}>
            <Text style={s.closeText}>×</Text>
          </Pressable>
          <Text style={s.title}>SNAP &amp; CONFIRM</Text>
          <View style={s.headerSpacer} />
        </View>
        <Text style={s.intro}>A private photo is optional. Your estimate stays editable.</Text>

        <View style={s.confirmRow}>
          {photoUri ? (
            <Pressable onPress={() => setPhotoUri(null)} accessibilityRole="button" accessibilityLabel="Remove selected photo" style={s.photoFrame}>
              <Image source={{ uri: photoUri }} style={s.photo} accessibilityLabel="Selected drink photo" />
              <Text style={s.privatePhoto}>PRIVATE</Text>
            </Pressable>
          ) : (
            <View style={s.photoFrame}>
              <View style={s.photoPlaceholder}><Text style={s.photoPlaceholderIcon}>◌</Text><Text style={s.photoPlaceholderText}>PRIVATE{`\n`}PHOTO</Text></View>
              <View style={s.photoActions}><Pressable onPress={() => void choosePhoto('camera')} accessibilityRole="button"><Text style={s.photoAction}>TAKE</Text></Pressable><Pressable onPress={() => void choosePhoto('library')} accessibilityRole="button"><Text style={s.photoAction}>CHOOSE</Text></Pressable></View>
            </View>
          )}
          <View style={s.confirmDetails}>
            <Text style={s.confirmLabel}>CONFIRMED</Text>
            <Text style={s.confirmName}>{selected.label}</Text>
            <Text style={[s.confirmDose, { color: selected.accent }]}>{dose}<Text style={s.confirmUnit}> mg</Text></Text>
            <Text style={s.estimateText}>ESTIMATED CAFFEINE</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>ESTIMATE — CONFIRM OR EDIT</Text>
        <View style={s.drinkRow}>
          {DRINK_OPTIONS.map((drink) => {
            const active = selectedId === drink.id;
            return (
              <GlassPressable
                key={drink.id}
                onPress={() => selectDrink(drink)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${drink.label}, estimated ${drink.defaultDose} milligrams caffeine`}
                style={[s.drinkChip, active && { borderColor: drink.accent, backgroundColor: alpha(drink.accent, 0.1) }]}
                selected={active}
              >
                <View style={[s.traceDot, { backgroundColor: drink.accent }]} /><Text style={[s.drinkName, active && { color: drink.accent }]}>{drink.label}</Text>
              </GlassPressable>
            );
          })}
        </View>

        <Text style={s.sectionLabel}>CAFFEINE ESTIMATE</Text>
        <View style={s.doseRow}>
          {DOSE_OPTIONS.map((value) => {
            const active = value === dose;
            return (
              <GlassPressable
                key={value}
                onPress={() => { void Haptics.selectionAsync(); setDose(value); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${value} milligrams caffeine`}
                style={s.dose}
                selected={active}
              >
                <Text style={[s.doseText, active && s.doseTextSelected]}>{value} mg</Text>
              </GlassPressable>
            );
          })}
        </View>

        <View style={s.impactCard}>
          <Text style={s.impactLabel}>LOW-IMPACT WINDOW</Text>
          <Text style={s.impactTitle}>This drink adds</Text>
          <View style={s.impactRow}><Text style={s.impactTime}>+{impact.addedMinutes}</Text><Text style={s.impactUnit}> min</Text></View>
          <Text style={s.impactBody}>{impact.readyAtMs ? `Lower impact after ${fmtClock(impact.readyAtMs)}. ` : ''}{formatImpact(impact)}.</Text>
          <Svg width="100%" height={44} style={s.impactCurve}>
            <Path d="M0 35 C34 36 42 12 70 24 S112 43 145 25 S207 7 254 27 S302 43 340 17" stroke={alpha(selected.accent, .82)} strokeWidth={1.3} fill="none" />
          </Svg>
        </View>

        <GlassPressable
          onPress={saveDrink}
          accessibilityRole="button"
          accessibilityLabel={`Record ${selected.label} with ${dose} milligrams caffeine`}
          style={s.saveButton}
          selected
        >
          <Text style={s.saveText}>Create trace</Text>
        </GlassPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  header: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerSpacer: { width: 44 },
  title: { color: color.text, fontFamily: 'Menlo', fontSize: 14, fontWeight: '500', letterSpacing: 1.2 },
  close: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  closeText: { color: color.text, fontSize: 31, fontWeight: '200', lineHeight: 34 },
  intro: { color: color.textMid, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: -4 },
  confirmRow: { flexDirection: 'row', gap: space.md, alignItems: 'stretch', paddingTop: space.md },
  photoFrame: { flex: 1.16, height: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: alpha(color.text, .22) },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  privatePhoto: { position: 'absolute', bottom: 8, left: 9, color: color.text, fontFamily: 'Menlo', fontSize: 10, letterSpacing: 1, backgroundColor: alpha(color.bg, .72), paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5 },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: alpha(color.primary, .035) },
  photoPlaceholderIcon: { color: color.primary, fontSize: 42, fontWeight: '200' },
  photoPlaceholderText: { color: color.textMid, fontFamily: 'Menlo', fontSize: 11, letterSpacing: 1, textAlign: 'center', lineHeight: 15 },
  photoActions: { height: 42, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.border },
  photoAction: { color: color.primary, fontFamily: 'Menlo', fontSize: 10, fontWeight: '700', letterSpacing: .7 },
  confirmDetails: { flex: 1, justifyContent: 'center', paddingVertical: space.sm },
  confirmLabel: { color: color.textMid, fontFamily: 'Menlo', fontSize: 11, fontWeight: '700', letterSpacing: .8 },
  confirmName: { color: color.text, fontSize: 23, lineHeight: 28, fontWeight: '400', marginTop: 8 },
  confirmDose: { fontSize: 35, lineHeight: 42, fontWeight: '200', marginTop: 3, fontVariant: ['tabular-nums'] },
  confirmUnit: { color: color.textMid, fontSize: 16, fontWeight: '400' },
  estimateText: { color: color.textMid, fontFamily: 'Menlo', fontSize: 10, letterSpacing: .7, marginTop: 3 },
  sectionLabel: { color: color.textMid, fontFamily: 'Menlo', fontSize: 11, fontWeight: '500', letterSpacing: .9, marginTop: space.sm, borderBottomWidth: 1, borderBottomColor: color.border, paddingBottom: space.sm },
  drinkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  drinkChip: { minHeight: 44, borderRadius: 13, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: 7 },
  traceDot: { width: 8, height: 8, borderRadius: 4 },
  drinkName: { color: color.textMid, fontSize: 14, fontWeight: '700' },
  doseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dose: { minWidth: 72, minHeight: 44, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  doseText: { color: color.textMid, fontSize: 14, fontWeight: '600' },
  doseTextSelected: { color: color.primary },
  impactCard: { borderRadius: 15, padding: space.lg, gap: 4, backgroundColor: alpha(color.surfaceHi, .48), borderColor: alpha(color.text, .22), borderWidth: 1, overflow: 'hidden' },
  impactLabel: { color: color.textMid, fontFamily: 'Menlo', fontSize: 11, fontWeight: '500', letterSpacing: 1 },
  impactRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  impactTime: { color: color.energy, fontSize: 32, lineHeight: 38, fontWeight: '300', fontVariant: ['tabular-nums'] },
  impactUnit: { color: color.energy, fontSize: 17 },
  impactTitle: { color: color.text, fontSize: 15, fontWeight: '400', lineHeight: 21, marginTop: 3 },
  impactBody: { color: color.textMid, fontSize: 13, lineHeight: 19 },
  impactCurve: { marginTop: -4, opacity: .8 },
  saveButton: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: color.primary, fontSize: 17, fontWeight: '800' },
});
