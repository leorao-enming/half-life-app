// =============================================================================
// app/_layout.tsx
// Root Layout — Step 1 Recovery
//
// Navigation restored. useEffect hooks remain commented out.
// Restore one block at a time after each screen is confirmed stable.
// =============================================================================

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// Printed once at module load so we can verify the Dev Client bundle URL.
// If hostUri is undefined the device cannot reach Metro — check your network.
console.log('[layout] expoConfig.hostUri :', Constants.expoConfig?.hostUri ?? '⚠ undefined — device may be unreachable');
console.log('[layout] expoConfig.scheme  :', Constants.expoConfig?.scheme   ?? '⚠ undefined');
console.log('[layout] expoConfig.slug    :', Constants.expoConfig?.slug     ?? '⚠ undefined');

// import { useEffect, useRef, useState } from 'react';
// import * as Notifications from 'expo-notifications';
// import * as Network from 'expo-network';
// import * as SplashScreen from 'expo-splash-screen';
// import { Alert, AppState, AppStateStatus } from 'react-native';
// import { useBioStore } from '../src/store/useBioStore';
// import { setupNotificationChannel, usePredictiveEngine } from '../hooks/usePredictiveEngine';

// SplashScreen.preventAutoHideAsync().catch(() => {});

// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

// function DeferredEngine({ multiplier }: { multiplier: number }) {
//   usePredictiveEngine(multiplier);
//   return null;
// }

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#000000" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}

// ─── Commented-out inner layout (restore phase by phase) ──────────────────────

// function RootLayoutInner({ onFatalError }: { onFatalError: (msg: string) => void }) {
//   const rehydrate        = useBioStore.persist.rehydrate;
//   const flushQueue       = useBioStore((s) => s.flushOfflineQueue);
//   const healthMultiplier = useBioStore((s) => s.profile.healthKitMultiplier);
//   const [uiReady, setUiReady]         = useState(false);
//   const [engineReady, setEngineReady] = useState(false);
//   const appStateRef    = useRef<AppStateStatus>(AppState.currentState);
//   const hasInitialized = useRef(false);

//   useEffect(() => {
//     SplashScreen.hideAsync().catch(() => {});
//     const t = setTimeout(() => setUiReady(true), 50);
//     return () => clearTimeout(t);
//   }, []);

//   useEffect(() => {
//     const t = setTimeout(() => setEngineReady(true), 3000);
//     return () => clearTimeout(t);
//   }, []);

//   useEffect(() => {
//     if (hasInitialized.current) return;
//     hasInitialized.current = true;
//     rehydrate().catch((e) => {
//       const msg = e instanceof Error ? e.message : String(e);
//       onFatalError(msg);
//     });
//   }, [rehydrate, onFatalError]);

//   useEffect(() => {
//     const timer = setTimeout(async () => {
//       try {
//         await setupNotificationChannel();
//         const { status } = await Notifications.getPermissionsAsync();
//         if (status !== 'granted') await Notifications.requestPermissionsAsync();
//       } catch {}
//     }, 1500);
//     return () => clearTimeout(timer);
//   }, []);

//   useEffect(() => {
//     const id = setInterval(async () => {
//       try {
//         if (useBioStore.getState().offlineQueue.length === 0) return;
//         const net = await Network.getNetworkStateAsync();
//         if (net.isConnected && net.isInternetReachable) void flushQueue();
//       } catch {}
//     }, 30_000);
//     return () => clearInterval(id);
//   }, [flushQueue]);

//   useEffect(() => {
//     const sub = AppState.addEventListener('change', (next) => {
//       if (appStateRef.current.match(/inactive|background/) && next === 'active') {
//         if (useBioStore.getState().offlineQueue.length > 0) void flushQueue();
//       }
//       appStateRef.current = next;
//     });
//     return () => sub.remove();
//   }, [flushQueue]);

//   if (!uiReady) {
//     return (
//       <View style={boot.container}>
//         <Text style={boot.label}>SYSTEM LOADING...</Text>
//       </View>
//     );
//   }

//   return (
//     <SafeAreaProvider>
//       <StatusBar style="light" backgroundColor="#000000" />
//       {engineReady && <DeferredEngine multiplier={healthMultiplier} />}
//       <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000000' } }}>
//         <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
//       </Stack>
//     </SafeAreaProvider>
//   );
// }

// ─── Styles (boot styles live in the commented-out RootLayoutInner block above) ──
