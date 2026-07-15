// =============================================================================
// app/_layout.tsx  —  Root Layout
// Boot sequence:
//   1. Rehydrate Zustand store from AsyncStorage
//   2. Supabase auth listener → setSupabaseUser → triggers cloud sync
//   3. Offline-queue flush: periodic (30 s) + AppState foreground
//
// HealthKit permission is requested only from the user's explicit choice in
// the Plan tab. Never prompt at app launch.
// =============================================================================

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Network from 'expo-network';
import { supabase } from '../lib/supabase';
import { useBioStore } from '../src/store/useBioStore';
import { AppEntrance } from '../components/AppEntrance';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

    // ── 3. Offline queue flush ─────────────────────────────────────────────
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
