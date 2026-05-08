import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser-side Supabase client (singleton via module scope).
 * Only import this in `'use client'` components.
 */
export const supabase = createBrowserClient(url, key)
