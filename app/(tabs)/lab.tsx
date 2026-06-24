import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useBioStore } from '../../src/store/useBioStore';
import { testHealthKitMinimal } from '../../lib/health';
import { supabase } from '../../lib/supabase';
import { color, font, alpha } from '../../src/theme/tokens';

// ─── Design tokens (mapped onto the unified theme) ───────────────────────────────
// Local keys are kept so the (many) style references below stay intact; the
// values now flow from src/theme/tokens.ts — no per-file palette drift.

const C = {
  BG:      color.bg,
  SURFACE: color.surface,
  BORDER:  color.border,
  GLASS:   alpha(color.text, 0.035),
  BLUE:    color.primary,
  GREEN:   color.ready,
  YELLOW:  color.energy,
  PINK:    color.alert,
  TEXT:    color.text,
  DIM:     color.textDim,
  MID:     color.textMid,
  SUB:     color.border,
} as const;

const MONO = font.mono;

// ─── Env var check ────────────────────────────────────────────────────────────────

const SUPABASE_URL_OK  = !!process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY_OK  = !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ENV_CONFIGURED   = SUPABASE_URL_OK && SUPABASE_KEY_OK;

// Log on first render so the developer can check the Metro console
console.log(
  '[lab] EXPO_PUBLIC_SUPABASE_URL:',
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '⚠ MISSING',
);
console.log(
  '[lab] EXPO_PUBLIC_SUPABASE_ANON_KEY:',
  SUPABASE_KEY_OK ? '✓ present' : '⚠ MISSING',
);

// ─── Runtime diagnostics — helps identify Expo Go vs dev build issues ─────────
console.log('[runtime] appOwnership:', Constants.appOwnership);
console.log('[runtime] executionEnvironment:', Constants.executionEnvironment);
console.log('[runtime] applicationId:', Application.applicationId);
console.log('[runtime] isDevice:', Device.isDevice);
console.log('[runtime] platform:', Platform.OS);

// ─── Metabolism levels ────────────────────────────────────────────────────────────

interface MetabLevel { id: string; label: string; desc: string; factor: number; color: string }

const METAB_LEVELS: MetabLevel[] = [
  { id: 'slow',   label: 'SLOW',   desc: '0.7×  EXTENDED CLEARANCE',  factor: 0.7, color: C.PINK   },
  { id: 'normal', label: 'NORM',   desc: '1.0×  STANDARD BASELINE',   factor: 1.0, color: C.BLUE   },
  { id: 'fast',   label: 'FAST',   desc: '1.3×  RAPID ELIMINATION',   factor: 1.3, color: C.GREEN  },
];

// ─── Allergen options ──────────────────────────────────────────────────────────────

const ALLERGENS = ['DAIRY', 'GLUTEN', 'NUTS', 'SOY', 'SULFITES', 'TAURINE'];

// ─── GlassCard ────────────────────────────────────────────────────────────────────
// BlurView removed — plain native View with matching aesthetic

interface GlassCardProps {
  children:     React.ReactNode;
  accentColor?: string;
  style?:       object;
}

function GlassCard({ children, accentColor = C.BLUE, style }: GlassCardProps) {
  return (
    <View
      style={[
        s.cardWrapper,
        {
          borderColor:  `${accentColor}22`,
          shadowColor:  accentColor,
        },
        style,
      ]}
    >
      <View style={[s.cardInner, { backgroundColor: C.GLASS }]}>
        {children}
      </View>
    </View>
  );
}

// ─── AuthPanel ────────────────────────────────────────────────────────────────────
// Shown when the user has no active Supabase session.
// Matches the app's dark HUD / biohacking aesthetic.

function AuthPanel() {
  const [mode,     setMode]     = useState<'login' | 'register'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [message,  setMessage]  = useState('');
  const [isError,  setIsError]  = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setIsError(true);
      setMessage('EMAIL AND PASSWORD ARE REQUIRED');
      return;
    }
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email:    email.trim(),
          password,
        });
        if (error) {
          setIsError(true);
          setMessage(error.message.toUpperCase());
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email:    email.trim(),
          password,
        });
        if (error) {
          setIsError(true);
          setMessage(error.message.toUpperCase());
        } else {
          setIsError(false);
          setMessage('REGISTRATION SUCCESSFUL  ·  CHECK YOUR EMAIL TO CONFIRM');
        }
      }
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message.toUpperCase() : 'UNKNOWN ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.authOuter}
    >
      <ScrollView
        contentContainerStyle={s.authScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Auth header ──────────────────────────────────────── */}
        <View style={s.authHeader}>
          <Text style={s.authEyebrow}>SECURE ACCESS TERMINAL</Text>
          <Text style={s.authTitle}>THE  LAB</Text>
          <Text style={s.authSubtitle}>
            LOG IN TO SYNC YOUR BIOMETRICS{'\n'}ACROSS ALL DEVICES
          </Text>
        </View>

        {/* ── Env-var warning (only shown if config is missing) ── */}
        {!ENV_CONFIGURED && (
          <View style={s.envWarning}>
            <Text style={s.envWarningTitle}>⚠  CLOUD SYNC DISABLED</Text>
            <Text style={s.envWarningBody}>
              {!SUPABASE_URL_OK  ? '  • EXPO_PUBLIC_SUPABASE_URL is missing\n' : ''}
              {!SUPABASE_KEY_OK  ? '  • EXPO_PUBLIC_SUPABASE_ANON_KEY is missing\n' : ''}
              {'\n'}Add these to your .env file and restart the dev server.
            </Text>
          </View>
        )}

        {/* ── Mode toggle ──────────────────────────────────────── */}
        <View style={s.modeRow}>
          {(['login', 'register'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => { setMode(m); setMessage(''); }}
              accessibilityRole="button"
              style={s.modeBtn}
            >
              <View
                style={[
                  s.modeBtnInner,
                  mode === m
                    ? { borderColor: C.BLUE, backgroundColor: `${C.BLUE}15` }
                    : { borderColor: C.BORDER, backgroundColor: 'transparent' },
                ]}
              >
                <Text style={[s.modeBtnText, { color: mode === m ? C.BLUE : C.MID }]}>
                  {m === 'login' ? 'LOG IN' : 'REGISTER'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── Form card ─────────────────────────────────────────── */}
        <GlassCard accentColor={C.BLUE} style={s.authCard}>

          <Text style={s.fieldLabel}>EMAIL ADDRESS</Text>
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); setMessage(''); }}
            placeholder="user@domain.com"
            placeholderTextColor={C.SUB}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={s.input}
            selectionColor={C.BLUE}
          />

          <View style={s.fieldSep} />

          <Text style={s.fieldLabel}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={(p) => { setPassword(p); setMessage(''); }}
            placeholder="••••••••••••"
            placeholderTextColor={C.SUB}
            secureTextEntry
            style={s.input}
            selectionColor={C.BLUE}
          />

          {/* ── Feedback message ─────────────────────────────── */}
          {message !== '' && (
            <View style={[s.msgBox, { borderColor: isError ? `${C.PINK}44` : `${C.GREEN}44` }]}>
              <Text style={[s.msgText, { color: isError ? C.PINK : C.GREEN }]}>
                {message}
              </Text>
            </View>
          )}

        </GlassCard>

        {/* ── Submit button ─────────────────────────────────────── */}
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !ENV_CONFIGURED}
          accessibilityRole="button"
          accessibilityLabel={mode === 'login' ? 'Log in' : 'Register'}
        >
          <View
            style={[
              s.submitBtn,
              {
                borderColor:     C.BLUE,
                shadowColor:     C.BLUE,
                opacity:         loading || !ENV_CONFIGURED ? 0.45 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.BLUE} />
            ) : (
              <Text style={[s.submitBtnText, { color: C.BLUE }]}>
                {mode === 'login' ? '→  AUTHENTICATE' : '→  CREATE ACCOUNT'}
              </Text>
            )}
          </View>
        </Pressable>

        {/* ── Footer note ──────────────────────────────────────── */}
        <Text style={s.authFooter}>
          {mode === 'login'
            ? 'NO ACCOUNT?  SWITCH TO REGISTER ABOVE'
            : 'ALREADY REGISTERED?  SWITCH TO LOG IN ABOVE'}
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── MetabolismSelector ───────────────────────────────────────────────────────────

interface MetabolismSelectorProps {
  substance: 'caffeine' | 'sugar' | 'sodium';
  label:     string;
  color:     string;
}

function MetabolismSelector({ substance, label, color }: MetabolismSelectorProps) {
  const factor        = useBioStore((s) => s.profile.metabolismFactors[substance]);
  const updateProfile = useBioStore((s) => s.updateBioProfile);

  const current = METAB_LEVELS.find((l) => Math.abs(l.factor - factor) < 0.05) ?? METAB_LEVELS[1];

  const setLevel = useCallback((level: MetabLevel) => {
    Haptics.selectionAsync();
    updateProfile({
      metabolismFactors: { [substance]: level.factor } as never,
    });
  }, [substance, updateProfile]);

  return (
    <View style={s.metabRow}>
      <View style={s.metabLabelWrap}>
        <View style={[s.metabDot, { backgroundColor: color }]} />
        <Text style={s.metabLabel}>{label}</Text>
      </View>
      <View style={s.metabButtons}>
        {METAB_LEVELS.map((level) => {
          const active = current.id === level.id;
          return (
            <MetabButton
              key={level.id}
              level={level}
              active={active}
              onPress={() => setLevel(level)}
            />
          );
        })}
      </View>
    </View>
  );
}

function MetabButton({ level, active, onPress }: { level: MetabLevel; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View
        style={[
          s.metabBtn,
          active
            ? { backgroundColor: `${level.color}20`, borderColor: level.color }
            : { backgroundColor: 'transparent', borderColor: C.BORDER },
        ]}
      >
        <Text style={[s.metabBtnText, { color: active ? level.color : C.MID }]}>
          {level.label}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── AllergyToggle ────────────────────────────────────────────────────────────────

function AllergyToggle({ allergen }: { allergen: string }) {
  const allergies     = useBioStore((s) => s.profile.allergies);
  const updateProfile = useBioStore((s) => s.updateBioProfile);

  const isOn = allergies.includes(allergen);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = isOn
      ? allergies.filter((a) => a !== allergen)
      : [...allergies, allergen];
    updateProfile({ allergies: next });
  }, [allergen, allergies, isOn, updateProfile]);

  return (
    <View style={s.allergyRow}>
      <View style={s.allergyLeft}>
        <View style={[s.allergyDot, { backgroundColor: isOn ? C.PINK : C.DIM }]} />
        <Text style={[s.allergyLabel, { color: isOn ? C.TEXT : C.MID }]}>
          {allergen}
        </Text>
      </View>
      <Switch
        value={isOn}
        onValueChange={toggle}
        trackColor={{ false: C.DIM, true: `${C.PINK}66` }}
        thumbColor={isOn ? C.PINK : C.SUB}
        ios_backgroundColor={C.DIM}
      />
    </View>
  );
}

// ─── RuntimeDiagnosticsBox ────────────────────────────────────────────────────────
// Shown above the HealthKit button; helps distinguish Expo Go / stale dev build.

function RuntimeDiagnosticsBox() {
  const isExpoGo = Constants.appOwnership === 'expo';
  const accent    = isExpoGo ? C.YELLOW : C.GREEN;

  const rows: Array<[string, string]> = [
    ['APP_OWNERSHIP', String(Constants.appOwnership         ?? 'null')],
    ['EXEC_ENV',      String(Constants.executionEnvironment ?? 'null')],
    ['APP_ID',        String(Application.applicationId       ?? 'null')],
    ['IS_DEVICE',     String(Device.isDevice)],
    ['PLATFORM',      Platform.OS],
  ];

  return (
    <View style={[s.diagBox, { borderColor: `${accent}33` }]}>
      <Text style={[s.diagTitle, { color: accent }]}>▸  RUNTIME  DIAGNOSTICS</Text>
      {rows.map(([key, val]) => (
        <View key={key} style={s.diagRow}>
          <Text style={s.diagKey}>{key}</Text>
          <Text style={[s.diagVal, { color: accent }]}>{val}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── HealthKitConnectButton ───────────────────────────────────────────────────────
// DIAGNOSTIC MODE: runs the minimal StepCount-only initHealthKit test and
// prints the exact raw callback result. No step data is read; nothing is written.
// Expand to full permissions only after this test confirms native linking works.

function HealthKitConnectButton() {
  const [status,     setStatus]     = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [rawResult,  setRawResult]  = useState<string>('');

  if (Platform.OS !== 'ios') return null;

  const handleTest = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    setRawResult('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await testHealthKitMinimal();

    if (result.success) {
      setStatus('ok');
      setRawResult('RAW CALLBACK → err: null  (initHealthKit succeeded)');
    } else {
      setStatus('error');
      // Show the exact raw string — no rewording
      setRawResult(`RAW CALLBACK → err: ${JSON.stringify(result.callbackError)}`);
    }
  };

  const label =
    status === 'loading' ? 'TESTING...' :
    status === 'ok'      ? 'HK INIT  ✓  STEPCOUNT' :
    status === 'error'   ? 'HK INIT  ✗  SEE BELOW' :
    'TEST HEALTHKIT (STEPCOUNT)';

  const accentColor =
    status === 'ok'    ? C.GREEN :
    status === 'error' ? C.PINK  :
    C.BLUE;

  return (
    <View>
      <Pressable onPress={handleTest} accessibilityRole="button" accessibilityLabel="Test Apple HealthKit native init">
        <View style={[s.hkBtn, { borderColor: `${accentColor}55` }]}>
          <View style={[s.hkDot, {
            backgroundColor:
              status === 'ok'      ? C.GREEN  :
              status === 'loading' ? C.YELLOW :
              status === 'error'   ? C.PINK   :
              C.DIM,
          }]} />
          <Text style={[s.hkBtnText, { color: accentColor }]}>{label}</Text>
        </View>
      </Pressable>
      {rawResult !== '' && (
        <Text style={[s.hkNote, { color: accentColor }]}>{rawResult}</Text>
      )}
    </View>
  );
}

// ─── ClearLogsButton ──────────────────────────────────────────────────────────────

function ClearLogsButton() {
  const clearLogs = useBioStore((s) => s.clearLogs);
  const logCount  = useBioStore((s) => s.logs.length);
  const [confirm, setConfirm] = useState(false);

  const handlePress = () => {
    if (!confirm) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3_000);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      clearLogs();
      setConfirm(false);
    }
  };

  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Clear all logs">
      <View style={[s.clearBtn, confirm && s.clearBtnConfirm]}>
        <Text style={[s.clearBtnText, confirm && s.clearBtnTextConfirm]}>
          {confirm ? '⚠  CONFIRM PURGE' : `PURGE LOGS  (${logCount})`}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── LabDashboard ─────────────────────────────────────────────────────────────────
// Shown when the user is authenticated.

interface LabDashboardProps {
  userEmail: string | null;
  onSignOut: () => void;
}

function LabDashboard({ userEmail, onSignOut }: LabDashboardProps) {
  const insets      = useSafeAreaInsets();
  const displayName = useBioStore((s) => s.profile.displayName);
  const logCount    = useBioStore((s) => s.logs.length);

  return (
    <View style={s.root}>

      {/* ─── Fixed Header ───────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerEyebrow}>CONFIGURATION PANEL</Text>
          <Text style={s.headerTitle}>THE  LAB</Text>
        </View>
        <View style={s.headerStats}>
          <Text style={s.headerStatValue}>{logCount}</Text>
          <Text style={s.headerStatLabel}>LOGS</Text>
        </View>
      </View>

      <View style={s.headerDivider} />

      {/* ─── Scrollable body ────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Section: Metabolism Rate ──────────────────────────────────── */}
        <Text style={s.sectionLabel}>▸  METABOLISM RATE</Text>
        <GlassCard accentColor={C.BLUE}>
          <Text style={s.cardIntro}>
            ADJUST YOUR SUBSTANCE CLEARANCE SPEED.{'\n'}
            AFFECTS SLEEP-READY ESTIMATES.
          </Text>
          <View style={s.metabDivider} />
          <MetabolismSelector substance="caffeine" label="CAFFEINE" color={C.BLUE}   />
          <View style={s.metabSep} />
          <MetabolismSelector substance="sugar"    label="SUGAR"    color={C.YELLOW} />
          <View style={s.metabSep} />
          <MetabolismSelector substance="sodium"   label="SODIUM"   color={C.GREEN}  />
        </GlassCard>

        {/* ── Section: Allergies & Flags ────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>▸  INTOLERANCES  &  FLAGS</Text>
        <GlassCard accentColor={C.PINK}>
          <Text style={s.cardIntro}>
            FLAG ACTIVE INTOLERANCES. TRIGGERS{'\n'}
            WARNING OVERLAYS IN THE LOG PANEL.
          </Text>
          <View style={s.metabDivider} />
          {ALLERGENS.map((allergen, i) => (
            <React.Fragment key={allergen}>
              {i > 0 && <View style={s.allergyDivider} />}
              <AllergyToggle allergen={allergen} />
            </React.Fragment>
          ))}
        </GlassCard>

        {/* ── Section: System ───────────────────────────────────────────── */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>▸  SYSTEM</Text>
        <GlassCard accentColor={C.DIM} style={{ borderColor: '#2A2A2A' }}>
          <View style={s.systemRow}>
            <Text style={s.systemKey}>USER ID</Text>
            <Text style={s.systemVal}>{displayName.toUpperCase()}</Text>
          </View>
          <View style={s.allergyDivider} />
          <View style={s.systemRow}>
            <Text style={s.systemKey}>EMAIL</Text>
            <Text style={[s.systemVal, { color: C.BLUE, fontSize: 9 }]}>
              {userEmail ? userEmail.toUpperCase() : 'GUEST'}
            </Text>
          </View>
          <View style={s.allergyDivider} />
          <View style={s.systemRow}>
            <Text style={s.systemKey}>ENGINE</Text>
            <Text style={[s.systemVal, { color: C.GREEN }]}>FIRST-ORDER KINETICS</Text>
          </View>
          <View style={s.allergyDivider} />
          <View style={s.systemRow}>
            <Text style={s.systemKey}>VERSION</Text>
            <Text style={s.systemVal}>HALF-LIFE  v2.0</Text>
          </View>
          <View style={s.allergyDivider} />
          <RuntimeDiagnosticsBox />
          <View style={s.metabDivider} />
          <HealthKitConnectButton />
          <View style={s.metabDivider} />
          <ClearLogsButton />
          <View style={s.metabDivider} />
          {/* Sign-out */}
          <Pressable onPress={onSignOut} accessibilityRole="button" accessibilityLabel="Sign out">
            <View style={s.signOutBtn}>
              <Text style={s.signOutBtnText}>SIGN OUT</Text>
            </View>
          </Pressable>
        </GlassCard>

      </ScrollView>
    </View>
  );
}

// ─── The Lab Screen ───────────────────────────────────────────────────────────────

export default function LabScreen() {
  type SessionLike = { user: { email?: string } } | null;
  const [session,        setSession]        = useState<SessionLike>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // One-shot session fetch + realtime auth listener
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession((data?.session ?? null) as SessionLike);
        setSessionChecked(true);
      })
      .catch(() => {
        setSession(null);
        setSessionChecked(true);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession((s ?? null) as SessionLike);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await supabase.auth.signOut();
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!sessionChecked) {
    return (
      <SafeAreaView style={[s.root, s.centred]} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color={C.BLUE} />
        <Text style={s.loadingText}>ESTABLISHING SECURE CHANNEL...</Text>
      </SafeAreaView>
    );
  }

  // ── Auth gate — shown for guests (session === null) ───────────────────────
  if (!session) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <AuthPanel />
      </SafeAreaView>
    );
  }

  // ── Authenticated — show User Profile / Lab Dashboard ────────────────────
  return (
    <LabDashboard
      userEmail={session.user.email ?? null}
      onSignOut={handleSignOut}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.BG,
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.MID,
    marginTop:     8,
  },

  // ── Auth panel ──────────────────────────────────────────────────────────────
  authOuter: {
    flex: 1,
  },
  authScroll: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },
  authHeader: {
    marginBottom: 28,
    alignItems: 'center',
    gap: 6,
  },
  authEyebrow: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.MID,
  },
  authTitle: {
    fontFamily:    MONO,
    fontSize:      26,
    fontWeight:    '200',
    letterSpacing: 2,
    color:         C.TEXT,
  },
  authSubtitle: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.MID,
    textAlign:     'center',
    lineHeight:    16,
    marginTop:     4,
  },

  // Env-var warning
  envWarning: {
    borderWidth:     1,
    borderColor:     `${C.YELLOW}44`,
    borderRadius:    14,
    backgroundColor: `${C.YELLOW}08`,
    padding:         16,
    marginBottom:    20,
  },
  envWarningTitle: {
    fontFamily:    MONO,
    fontSize:      10,
    letterSpacing: 3,
    color:         C.YELLOW,
    fontWeight:    '700',
    marginBottom:  8,
  },
  envWarningBody: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 1,
    color:         `${C.YELLOW}BB`,
    lineHeight:    16,
  },

  // Mode toggle
  modeRow: {
    flexDirection:  'row',
    gap:            10,
    marginBottom:   16,
  },
  modeBtn: {
    flex: 1,
  },
  modeBtnInner: {
    borderWidth:    1,
    borderRadius:   12,
    paddingVertical: 12,
    alignItems:     'center',
  },
  modeBtnText: {
    fontFamily:    MONO,
    fontSize:      10,
    letterSpacing: 3,
    fontWeight:    '700',
  },

  // Auth card (extends GlassCard)
  authCard: {
    marginBottom: 16,
  },

  // Form fields
  fieldLabel: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    color:         C.MID,
    marginBottom:  8,
  },
  input: {
    fontFamily:      MONO,
    fontSize:        13,
    letterSpacing:   1,
    color:           C.TEXT,
    borderWidth:     1,
    borderColor:     C.BORDER,
    borderRadius:    10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    backgroundColor: color.surface,
  },
  fieldSep: {
    height:        16,
  },
  msgBox: {
    borderWidth:     1,
    borderRadius:    10,
    paddingHorizontal: 14,
    paddingVertical:   10,
    marginTop:       16,
    backgroundColor: 'transparent',
  },
  msgText: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    lineHeight:    16,
    fontWeight:    '700',
  },

  // Submit button
  submitBtn: {
    borderWidth:      1.5,
    borderRadius:     50,
    paddingVertical:  19,
    alignItems:       'center',
    justifyContent:   'center',
    backgroundColor:  color.surface,
    shadowOffset:     { width: 0, height: 0 },
    shadowOpacity:    0.5,
    shadowRadius:     16,
    elevation:        10,
    minHeight:        56,
  },
  submitBtnText: {
    fontFamily:    MONO,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing: 2,
  },
  authFooter: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
    textAlign:     'center',
    marginTop:     20,
    lineHeight:    16,
  },

  // ── Lab dashboard ────────────────────────────────────────────────────────────

  // Header
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'flex-end',
    paddingHorizontal: 22,
    paddingBottom:   14,
  },
  headerEyebrow: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.MID,
  },
  headerTitle: {
    fontFamily:    MONO,
    fontSize:      22,
    fontWeight:    '200',
    letterSpacing: 2,
    color:         C.TEXT,
    marginTop:     2,
  },
  headerStats: {
    alignItems: 'flex-end',
  },
  headerStatValue: {
    fontFamily:    MONO,
    fontSize:      28,
    fontWeight:    '200',
    color:         C.BLUE,
    letterSpacing: 0,
  },
  headerStatLabel: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
  },
  headerDivider: {
    height:            1,
    backgroundColor:   C.BORDER,
    marginHorizontal:  22,
    marginBottom:      6,
  },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop:        20,
  },

  // Section labels
  sectionLabel: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    color:         C.MID,
    marginBottom:  10,
    marginLeft:    4,
  },

  // Glass card (plain View — BlurView removed)
  cardWrapper: {
    borderRadius:    24,
    borderWidth:     0.5,
    backgroundColor: color.surface,
    shadowColor:     C.BLUE,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.12,
    shadowRadius:    12,
    elevation:       6,
    marginBottom:    0,
  },
  cardInner: {
    padding:         20,
    borderRadius:    24,
    overflow:        'hidden',
  },
  cardIntro: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
    lineHeight:    14,
    marginBottom:  4,
  },
  metabDivider: {
    height:          1,
    backgroundColor: C.BORDER,
    marginVertical:  14,
  },

  // Metabolism row
  metabRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  metabLabelWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    flex:          1,
  },
  metabDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  metabLabel: {
    fontFamily:    MONO,
    fontSize:      11,
    letterSpacing: 2,
    color:         C.TEXT,
    fontWeight:    '700',
  },
  metabButtons: {
    flexDirection: 'row',
    gap:           6,
  },
  metabBtn: {
    borderWidth:       1,
    borderRadius:      8,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  metabBtnText: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 2,
    fontWeight:    '700',
  },
  metabSep: {
    height:          1,
    backgroundColor: '#111',
    marginVertical:  12,
  },

  // Allergy row
  allergyRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  allergyLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  allergyDot: {
    width:        5,
    height:       5,
    borderRadius: 3,
  },
  allergyLabel: {
    fontFamily:    MONO,
    fontSize:      11,
    letterSpacing: 2,
    fontWeight:    '700',
  },
  allergyDivider: {
    height:          1,
    backgroundColor: '#111',
  },

  // System rows
  systemRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 8,
  },
  systemKey: {
    fontFamily:    MONO,
    fontSize:      9,
    letterSpacing: 3,
    color:         C.MID,
  },
  systemVal: {
    fontFamily:    MONO,
    fontSize:      10,
    letterSpacing: 2,
    color:         C.TEXT,
    fontWeight:    '700',
  },

  // HealthKit connect button
  hkBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   11,
    gap:               8,
    marginTop:         2,
  },
  hkDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  hkBtnText: {
    fontFamily:    MONO,
    fontSize:      11,
    letterSpacing: 3,
    fontWeight:    '700',
  },
  hkNote: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 1,
    lineHeight:    14,
    marginTop:     6,
    marginLeft:    4,
    opacity:       0.85,
  },

  // Clear logs button
  clearBtn: {
    borderWidth:     1,
    borderColor:     C.DIM,
    borderRadius:    10,
    paddingVertical: 12,
    alignItems:      'center',
  },
  clearBtnConfirm: {
    borderColor:     C.PINK,
    backgroundColor: alpha(C.PINK, 0.06),
  },
  clearBtnText: {
    fontFamily:    MONO,
    fontSize:      11,
    letterSpacing: 2,
    color:         C.MID,
    fontWeight:    '400',
  },
  clearBtnTextConfirm: {
    color: C.PINK,
  },

  // Sign-out button
  signOutBtn: {
    borderWidth:     1,
    borderColor:     `${C.PINK}44`,
    borderRadius:    10,
    paddingVertical: 12,
    alignItems:      'center',
    backgroundColor: `${C.PINK}08`,
  },
  signOutBtnText: {
    fontFamily:    MONO,
    fontSize:      11,
    letterSpacing: 4,
    color:         C.PINK,
    fontWeight:    '700',
  },

  // Runtime diagnostics box
  diagBox: {
    borderWidth:     1,
    borderRadius:    10,
    paddingHorizontal: 12,
    paddingVertical:   10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap:             4,
  },
  diagTitle: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 3,
    fontWeight:    '700',
    marginBottom:  6,
  },
  diagRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  diagKey: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 2,
    color:         C.MID,
  },
  diagVal: {
    fontFamily:    MONO,
    fontSize:      8,
    letterSpacing: 1,
    fontWeight:    '700',
    flexShrink:    1,
    textAlign:     'right',
    marginLeft:    8,
  },
});
