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

function startOfUtcDayIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString()
}

function getUtcSyncWindow(date = new Date()): { windowStartHour: number; windowLabel: string } {
  const hour = date.getUTCHours()
  if (hour >= 18) return { windowStartHour: 18, windowLabel: '18:00Z' }
  return { windowStartHour: 10, windowLabel: '10:00Z' }
}

function startOfUtcHourWindowIso(windowStartHour: number, date = new Date()): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), windowStartHour, 0, 0),
  ).toISOString()
}


function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  if (error && typeof error === 'object') {
    return error as Record<string, unknown>
  }
  return { value: String(error) }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()

  try {
    const cronAuthorized = hasValidCronToken(request.headers.get('authorization'))
    const superadminUserId = !cronAuthorized ? await getSuperadminUserId() : null
    const superadminAuthorized = Boolean(superadminUserId)

    if (!cronAuthorized && !superadminAuthorized) {
      console.warn('[public-data-sync] Unauthorized request blocked', { requestId })
      return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 })
    }

    const admin = createSupabaseAdminClient()
    const trigger = cronAuthorized ? 'cron' : 'manual'

    console.info('[public-data-sync] Sync request accepted', { requestId, trigger })

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
      console.warn('[public-data-sync] Sync skipped', { requestId, trigger, reason })
      return NextResponse.json(
        { skipped: true, reason, requestId },
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
      console.warn('[public-data-sync] Sync skipped', { requestId, trigger, reason })
      return NextResponse.json(
        { skipped: true, reason, requestId },
        { status: 200 },
      )
    }

    if (cronAuthorized) {
      const syncWindow = getUtcSyncWindow()
      const { count: completedWindowCount, error: completedTodayError } = await admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'public_data_sync_completed')
        .eq('table_name', 'public_data_sync')
        .gte('created_at', startOfUtcHourWindowIso(syncWindow.windowStartHour))

      if (completedTodayError) throw completedTodayError

      if ((completedWindowCount ?? 0) > 0) {
        const reason = `Auto sync already completed in the ${syncWindow.windowLabel} UTC window; skipping duplicate run.`
        await writeAuditLog('public_data_sync_skipped', {
          trigger: 'cron',
          reason,
        })
        console.warn('[public-data-sync] Sync skipped', { requestId, trigger, reason })
        return NextResponse.json({ skipped: true, reason, requestId }, { status: 200 })
      }
    }

    const summary = await runPublicDataSync(admin, { requestId })
    await writeAuditLog('public_data_sync_completed', {
      request_id: requestId,
      trigger,
      auto_sync_enabled: autoSyncEnabled,
      duration_ms: Date.now() - startedAt,
      summary,
    })

    console.info('[public-data-sync] Sync completed', {
      requestId,
      trigger,
      durationMs: Date.now() - startedAt,
      flightsInserted: summary.flights_inserted,
      cruisesInserted: summary.cruises_inserted,
      warnings: summary.warnings.length,
    })

    return NextResponse.json({ ok: true, summary, requestId }, { status: 200 })
  } catch (error) {
    const message = extractErrorMessage(error, 'Public data sync failed.')
    console.error('[public-data-sync] Sync failed', {
      requestId,
      message,
      durationMs: Date.now() - startedAt,
      error: serializeError(error),
    })

    try {
      const admin = createSupabaseAdminClient()
      await admin.from('audit_logs').insert({
        action: 'public_data_sync_failed',
        table_name: 'public_data_sync',
        record_id: null,
        new_values: {
          request_id: requestId,
          error: message,
          duration_ms: Date.now() - startedAt,
        },
      })
    } catch {
      // If logging fails, still return the original sync error response.
    }

    return NextResponse.json(
      { error: message, requestId },
      { status: 500 },
    )
  }
}
