import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client.
 * Both the app and admin packages call this with their own env vars.
 */
export function createSupabaseClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
