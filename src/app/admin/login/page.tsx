'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Suspense } from 'react'
import { ADMIN_ROLES } from '@/lib/auth-roles'
import Link from 'next/link'
import { User } from 'lucide-react'

function AdminLoginForm() {
  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const unauthorizedError = searchParams.get('error') === 'unauthorized'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(unauthorizedError ? 'Access denied: superadmin required.' : '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password, { allowedRoles: ADMIN_ROLES })
      router.push('/admin/companies')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-md border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700"
            title="User login"
          >
            <User size={14} />
            User login
          </Link>
        </div>
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-white text-xl font-bold shadow">
            LNG
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Console</h1>
          <p className="text-sm text-gray-400">Super administrator sign in</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-gray-700 bg-gray-800 p-8 shadow-sm"
        >
          {error && (
            <div className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300 border border-red-700">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="admin@company.com"
              className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  )
}
