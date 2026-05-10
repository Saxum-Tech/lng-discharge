import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { runPublicDataSync } from '@/lib/public-data-sync'
import { SETTINGS_ID } from '@/lib/constants'

async function getSuperadminUserId() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

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
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', user.id)
    .single()

  if (profile?.is_active === true && profile.role === 'superadmin') {
    return user.id
  }

  return null
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
    const superadminUserId = !cronAuthorized ? await getSuperadminUserId() : null
    const superadminAuthorized = Boolean(superadminUserId)

    if (!cronAuthorized && !superadminAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()

    async function writeAuditLog(action: string, newValues: Record<string, unknown>) {
      const { error: auditError } = await admin.from('audit_logs').insert({
        user_id: superadminUserId,
        action,
        table_name: 'public_data_sync',
        record_id: null,
        new_values: newValues,
      })

      if (auditError) {
        throw new Error(`Failed to write sync audit log: ${auditError.message}`)
      }
    }

    const { data: settings, error: settingsError } = await admin
      .from('app_settings')
      .select('auto_sync_enabled')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (settingsError) throw settingsError

    if (cronAuthorized && !settings) {
      const reason = 'Auto sync skipped: system settings row is missing.'
      await writeAuditLog('public_data_sync_skipped', {
        trigger: 'cron',
        reason,
      })
      return NextResponse.json(
        { skipped: true, reason },
        { status: 200 },
      )
    }

    const autoSyncEnabled = settings?.auto_sync_enabled ?? false

    if (cronAuthorized && !autoSyncEnabled) {
      const reason = 'Auto sync disabled in system settings.'
      await writeAuditLog('public_data_sync_skipped', {
        trigger: 'cron',
        reason,
      })
      return NextResponse.json(
        { skipped: true, reason },
        { status: 200 },
      )
    }

    const summary = await runPublicDataSync(admin)
    await writeAuditLog('public_data_sync_completed', {
      trigger: cronAuthorized ? 'cron' : 'manual',
      auto_sync_enabled: autoSyncEnabled,
      summary,
    })

    return NextResponse.json({ ok: true, summary }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Public data sync failed.'

    try {
      const admin = createSupabaseAdminClient()
      await admin.from('audit_logs').insert({
        action: 'public_data_sync_failed',
        table_name: 'public_data_sync',
        record_id: null,
        new_values: {
          error: message,
        },
      })
    } catch {
      // If logging fails, still return the original sync error response.
    }

    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
