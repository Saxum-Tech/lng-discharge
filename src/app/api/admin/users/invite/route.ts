import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const invitePayloadSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
    fullName: z.string().trim().min(1, 'Full name is required.'),
    role: z.enum(['superadmin', 'company_admin', 'viewer'], {
      errorMap: () => ({ message: 'Role must be one of: superadmin, company_admin, viewer.' }),
    }),
    companyId: z.string().trim().nullable().optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.role === 'superadmin') {
      if (payload.companyId !== null && payload.companyId !== undefined && payload.companyId !== '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['companyId'],
          message: 'Superadmin invites must not include a company.',
        })
      }
      return
    }

    if (!payload.companyId || payload.companyId.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyId'],
        message: 'Company is required for company_admin and viewer roles.',
      })
    }
  })

function formatValidationErrors(issues: z.ZodIssue[]) {
  const fieldErrors = issues.reduce<Record<string, string[]>>((acc, issue) => {
    const field = issue.path[0]?.toString() ?? 'form'
    acc[field] = [...(acc[field] ?? []), issue.message]
    return acc
  }, {})

  return {
    error: 'Invalid invite payload.',
    fields: fieldErrors,
  }
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

    const body = await request.json()
    const parsed = invitePayloadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(formatValidationErrors(parsed.error.issues), { status: 400 })
    }

    const email = parsed.data.email
    const fullName = parsed.data.fullName
    const role = parsed.data.role
    const companyId = parsed.data.companyId?.trim() || null

    const admin = createSupabaseAdminClient()

    if (role === 'company_admin' || role === 'viewer') {
      const { data: company, error: companyError } = await admin
        .from('companies')
        .select('id, is_active')
        .eq('id', companyId)
        .single()

      if (companyError || !company || company.is_active !== true) {
        return NextResponse.json(
          {
            error: 'Invalid invite payload.',
            fields: {
              companyId: ['Selected company does not exist or is inactive.'],
            },
          },
          { status: 400 },
        )
      }
    }

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role, company_id: role === 'superadmin' ? null : companyId },
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
