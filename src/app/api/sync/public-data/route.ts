import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { runPublicDataSync } from '@/lib/public-data-sync'
import { SETTINGS_ID } from '@/lib/constants'

async function isSuperadminRequest() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return profile?.role === 'superadmin'
}

function hasValidCronToken(authHeader: string | null) {
  const syncToken = process.env.SYNC_CRON_TOKEN || process.env.CRON_SECRET
  if (!syncToken) return false
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  return bearer === syncToken
}

export async function POST(request: Request) {
  try {
    const cronAuthorized = hasValidCronToken(request.headers.get('authorization'))
    const superadminAuthorized = !cronAuthorized && (await isSuperadminRequest())

    if (!cronAuthorized && !superadminAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    const { data: settings, error: settingsError } = await admin
      .from('app_settings')
      .select('auto_sync_enabled')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (settingsError) throw settingsError

    if (cronAuthorized && settings?.auto_sync_enabled === false) {
      return NextResponse.json(
        { skipped: true, reason: 'Auto sync disabled in system settings.' },
        { status: 200 },
      )
    }

    const summary = await runPublicDataSync(admin)
    return NextResponse.json({ ok: true, summary }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Public data sync failed.' },
      { status: 500 },
    )
  }
}
