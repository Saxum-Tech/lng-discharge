'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PORTAL_ROLES } from '@/lib/auth-roles'

function LoginForm() {
  const { signIn } = useAuth()
  const { settings } = useTheme()
  const router = useRouter()
  const searchParams = useSearchParams()
  const unauthorizedError = searchParams.get('error') === 'unauthorized'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(
    unauthorizedError ? 'Access denied: an active portal user account is required.' : '',
  )
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password, { allowedRoles: PORTAL_ROLES })
      router.push('/calendar')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-14 w-auto" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white text-xl font-bold shadow">
              LNG
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">
            {settings?.app_name ?? 'LNG Discharge Planner'}
          </h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Sign in
          </Button>
        </form>

        {settings?.footer_text && (
          <p className="mt-6 text-center text-xs text-gray-400">{settings.footer_text}</p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
