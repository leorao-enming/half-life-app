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
import { Alert } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const missingVars: string[] = [];
if (!supabaseUrl)      missingVars.push('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseAnonKey)  missingVars.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (missingVars.length > 0) {
  missingVars.forEach((v) => console.error(`[supabase] Missing ${v} — cloud sync will not work.`));

  // Defer Alert until after the RN bridge and root component have mounted.
  setTimeout(() => {
    Alert.alert(
      '⚠  Cloud Sync Disabled',
      `The following environment variable${missingVars.length > 1 ? 's are' : ' is'} missing:\n\n` +
      missingVars.map((v) => `  • ${v}`).join('\n') +
      '\n\nCreate a .env file in the project root and restart the dev server to enable cloud sync.',
      [{ text: 'OK' }],
    );
  }, 1_500);
}

function createSafeClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a no-op proxy so the app doesn't crash when env vars are absent.
    // All method calls resolve with a "not configured" error rather than throwing.
    return new Proxy({} as SupabaseClient, {
      get: (_target, prop) => {
        if (prop === 'auth') {
          return new Proxy({}, {
            get: () => () => Promise.resolve({ data: null, error: new Error('[supabase] Client not configured') }),
          });
        }
        return () => Promise.resolve({ data: null, error: new Error('[supabase] Client not configured') });
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
