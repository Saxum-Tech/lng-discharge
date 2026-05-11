'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PORTAL_ROLES } from '@/lib/auth-roles'
import Link from 'next/link'
import { Shield } from 'lucide-react'

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
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-900 bg-cover bg-center bg-no-repeat px-4"
      style={{ backgroundImage: "url('/gibraltar-port.png')" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end">
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            title="Admin login"
          >
            <Shield size={14} />
            Admin
          </Link>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/30 bg-white/20 p-8 shadow-xl backdrop-blur-md"
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <img src={settings?.logo_url ?? '/turner-logo.jpg'} alt="Turner & Co logo" className="h-[70px] w-auto" />
            <p className="text-sm font-medium text-white/80">Turner &amp; Co (Gibraltar) Ltd</p>
            <h1 className="text-2xl font-bold text-white">{settings?.app_name ?? 'LNG Discharge Planner'}</h1>
            <p className="text-sm text-white/80">Sign in to your account</p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-300/50 bg-red-500/20 px-4 py-3 text-sm text-red-100">
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
          <div className="-mt-1 text-right">
            <button
              type="button"
              onClick={() => setError('Please contact your administrator to reset your password.')}
              className="text-xs font-medium text-white/85 underline-offset-2 hover:text-white hover:underline"
            >
              Forgot password?
            </button>
          </div>
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
