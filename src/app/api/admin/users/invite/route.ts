import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import type { UserRole } from '@/lib/types'

const ALLOWED_ROLES: UserRole[] = ['superadmin', 'company_admin', 'viewer']

type InvitePayload = {
  email?: string
  fullName?: string
  role?: UserRole
  companyId?: string | null
}

async function isSuperadminBearer(authHeader: string | null) {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!token || !url || !anonKey) return false

  const supabase = createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', user.id)
    .single()

  return profile?.is_active === true && profile.role === 'superadmin'
}

export async function POST(request: Request) {
  try {
    const authorized = await isSuperadminBearer(request.headers.get('authorization'))
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as InvitePayload
    const email = body.email?.trim().toLowerCase()
    const fullName = body.fullName?.trim()
    const role = body.role
    const companyId = body.companyId?.trim() || null

    if (!email || !fullName || !role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid invite payload.' }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role, company_id: companyId },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send invite.' },
      { status: 500 },
    )
  }
}
