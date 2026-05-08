#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const TEST_COMPANY_ID = '11111111-1111-4111-8111-111111111111'

const DEFAULTS = {
  portalEmail: 'frontend.test@lng.local',
  adminEmail: 'admin.test@lng.local',
  portalPassword: 'PortalTest!2026',
  adminPassword: 'AdminTest!2026',
}

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getConfig() {
  if (process.env.ALLOW_TEST_USER_SEEDING !== 'true') {
    throw new Error(
      'Refusing to seed test users. Set ALLOW_TEST_USER_SEEDING=true after confirming this is a non-production/test Supabase project.',
    )
  }

  return {
    supabaseUrl: getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    portalEmail: process.env.TEST_PORTAL_EMAIL ?? DEFAULTS.portalEmail,
    adminEmail: process.env.TEST_ADMIN_EMAIL ?? DEFAULTS.adminEmail,
    portalPassword: process.env.TEST_PORTAL_PASSWORD ?? DEFAULTS.portalPassword,
    adminPassword: process.env.TEST_ADMIN_PASSWORD ?? DEFAULTS.adminPassword,
  }
}

async function findUserByEmail(admin, email) {
  const normalizedEmail = email.toLowerCase()
  let page = 1
  const perPage = 100

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail)
    if (user) return user
    if (data.users.length < perPage) return null
    page += 1
  }
}

async function upsertAuthUser(admin, { email, password, fullName, role }) {
  const existingUser = await findUserByEmail(admin, email)
  const userMetadata = { full_name: fullName, role }

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (error) throw error
    return data.user
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  })
  if (error) throw error
  return data.user
}

async function upsertProfile(admin, { userId, companyId, role, fullName }) {
  const { error } = await admin.from('profiles').upsert(
    {
      user_id: userId,
      company_id: companyId,
      role,
      full_name: fullName,
      is_active: true,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

async function main() {
  const config = getConfig()
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: companyError } = await admin.from('companies').upsert({
    id: TEST_COMPANY_ID,
    name: 'LNG Test Company',
    type: 'Other',
    is_active: true,
  })
  if (companyError) throw companyError

  const portalUser = await upsertAuthUser(admin, {
    email: config.portalEmail,
    password: config.portalPassword,
    fullName: 'Frontend Test User',
    role: 'viewer',
  })
  await upsertProfile(admin, {
    userId: portalUser.id,
    companyId: TEST_COMPANY_ID,
    role: 'viewer',
    fullName: 'Frontend Test User',
  })

  const adminUser = await upsertAuthUser(admin, {
    email: config.adminEmail,
    password: config.adminPassword,
    fullName: 'Backend Admin Test User',
    role: 'superadmin',
  })
  await upsertProfile(admin, {
    userId: adminUser.id,
    companyId: null,
    role: 'superadmin',
    fullName: 'Backend Admin Test User',
  })

  console.log('Seeded test users successfully:')
  console.log(`- Frontend portal: ${config.portalEmail}`)
  console.log(`- Backend admin:   ${config.adminEmail}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
