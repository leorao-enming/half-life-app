import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassPressable } from '../components/GlassPressable';
import { alpha, color, font, space } from '../src/theme/tokens';

const UPDATED = 'July 14, 2026';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + space.xxl }]}>
        <GlassPressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={color.text} /><Text style={s.backText}>PLAN</Text>
        </GlassPressable>
        <Text style={s.title}>PRIVACY &amp; DATA USE</Text>
        <Text style={s.updated}>Last updated {UPDATED}</Text>

        <Section title="LOCAL BY DEFAULT">
          Your drink entries, estimates, and optional drink photos are stored on this device. Drink photos stay on this device and are not uploaded by Half-Life.
        </Section>
        <Section title="APPLE HEALTH">
          Apple Health access is optional and requested only after you tap Connect Apple Health. Half-Life reads heart-rate and sleep data to personalize a caffeine-clearance estimate. The underlying Apple Health data is not uploaded by Half-Life.
        </Section>
        <Section title="OPTIONAL CLOUD SYNC">
          If you sign in to a cloud-sync build, Half-Life may store your drink entries and notes with your account so they can sync between your devices. Do not include sensitive information in notes. Cloud-sync data is used only to provide that feature, not for advertising or sale.
        </Section>
        <Section title="YOUR CHOICES">
          You can remove local entries in the app or delete the app to remove local data. For a cloud-sync account, use the support contact listed in the App Store or TestFlight test information to request account and synced-data deletion.
        </Section>
        <Text style={s.note}>Half-Life provides estimated wellness guidance only. It does not provide medical advice, diagnosis, or treatment.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.copy}>{children}</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  back: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: space.sm, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: color.text, fontFamily: font.mono, fontSize: 11, letterSpacing: .7 },
  title: { color: color.text, fontFamily: font.mono, fontSize: 15, letterSpacing: 1.3, marginTop: space.sm },
  updated: { color: color.textDim, fontSize: 12, marginTop: -space.md },
  section: { borderRadius: 15, padding: space.lg, borderWidth: 1, borderColor: alpha(color.text, .18), backgroundColor: alpha(color.surfaceHi, .35), gap: space.sm },
  sectionTitle: { color: color.primary, fontFamily: font.mono, fontSize: 11, letterSpacing: .8 },
  copy: { color: color.textMid, fontSize: 14, lineHeight: 21 },
  note: { color: color.textDim, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: space.sm },
});
