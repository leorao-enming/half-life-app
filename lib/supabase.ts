// =============================================================================
// lib/supabase.ts
// Supabase client configured for React Native / Expo.
//
// AsyncStorage is injected as the auth session storage so that JWT tokens
// survive app restarts on both iOS and Android without any web-only APIs.
//
// Env vars must be prefixed with EXPO_PUBLIC_ to be inlined by Metro at
// build time (equivalent of NEXT_PUBLIC_ in a Next.js project).
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Cloud sync is optional. Missing configuration deliberately falls back to the
// local-only client below; setup details must never interrupt the user-facing app.

function createSafeClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a no-op proxy so the app doesn't crash when env vars are absent.
    // All method calls resolve with a "not configured" error rather than throwing.
    const notConfiguredError = new Error('[supabase] Client not configured');
    const notConfiguredResult = () => Promise.resolve({ data: null, error: notConfiguredError });
    const authFallback = {
      getSession: notConfiguredResult,
      signInWithPassword: notConfiguredResult,
      signUp: notConfiguredResult,
      signOut: notConfiguredResult,
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
        error: null,
      }),
    };

    return new Proxy({} as SupabaseClient, {
      get: (_target, prop) => {
        if (prop === 'auth') {
          return new Proxy(authFallback, {
            get: (authTarget, authProp) => {
              if (authProp in authTarget) {
                return authTarget[authProp as keyof typeof authTarget];
              }
              return notConfiguredResult;
            },
          });
        }
        return notConfiguredResult;
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = createSafeClient();
