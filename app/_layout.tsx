// =============================================================================
// app/_layout.tsx  —  Root Layout
// Boot sequence:
//   1. Rehydrate Zustand store from AsyncStorage
//   2. Supabase auth listener → setSupabaseUser → triggers cloud sync
//   3. HealthKit auto-init on iOS → setHealthKitMultiplier
//   4. Notification permissions (deferred 2 s to avoid startup jank)
//   5. Offline-queue flush: periodic (30 s) + AppState foreground
// =============================================================================

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { initHealthKit } from '../lib/health';
import { useBioStore } from '../src/store/useBioStore';
import { AppEntrance } from '../components/AppEntrance';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

console.log('[layout] hostUri:', Constants.expoConfig?.hostUri ?? '⚠ undefined');
console.log('[layout] scheme :', Constants.expoConfig?.scheme  ?? '⚠ undefined');

export default function RootLayout() {
  const hasInitRef  = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    // ── 1. Store rehydration ───────────────────────────────────────────────
    void useBioStore.persist.rehydrate();

    // ── 2. Auth listener — central source of truth for all screens ─────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useBioStore.getState().setSupabaseUser(session?.user.id ?? null);
    });

    // Initial session check (covers cold start where onAuthStateChange may fire late)
    supabase.auth.getSession()
      .then(({ data }) => {
        const uid = data?.session?.user.id ?? null;
        if (uid) useBioStore.getState().setSupabaseUser(uid);
      })
      .catch(() => {});

    // ── 3. HealthKit auto-init (iOS only, non-blocking) ────────────────────
    if (Platform.OS === 'ios') {
      initHealthKit()
        .then(({ multiplier }) => {
          useBioStore.getState().setHealthKitMultiplier(multiplier);
          console.log('[layout] HealthKit multiplier:', multiplier.toFixed(3));
        })
        .catch(() => {});
    }

    // ── 4. Notification permissions (deferred to avoid startup jank) ───────
    const notifTimer = setTimeout(async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('biohazard', {
            name:             'Half-Life Alerts',
            importance:       Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 100, 250],
            lightColor:       '#FF073A',
            sound:            'default',
          });
        }
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') await Notifications.requestPermissionsAsync();
      } catch {}
    }, 2_000);

    // ── 5. Offline queue flush ─────────────────────────────────────────────
    const flushInterval = setInterval(async () => {
      try {
        if (useBioStore.getState().offlineQueue.length === 0) return;
        const net = await Network.getNetworkStateAsync();
        if (net.isConnected && net.isInternetReachable) {
          await useBioStore.getState().flushOfflineQueue();
        }
      } catch {}
    }, 30_000);

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        if (useBioStore.getState().offlineQueue.length > 0) {
          void useBioStore.getState().flushOfflineQueue();
        }
      }
      appStateRef.current = next;
    });

    // ── Splash hide ────────────────────────────────────────────────────────
    SplashScreen.hideAsync().catch(() => {});

    return () => {
      subscription.unsubscribe();
      clearTimeout(notifTimer);
      clearInterval(flushInterval);
      appStateSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AppEntrance>
        <StatusBar style="light" backgroundColor="#000000" />
        <Stack
          screenOptions={{
            headerShown:  false,
            animation:    'fade',
            contentStyle: { backgroundColor: '#000000' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AppEntrance>
    </SafeAreaProvider>
  );
}
