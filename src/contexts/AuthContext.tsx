'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/types'
import { roleCanAccessAdmin, roleCanAccessPortal, roleIsAllowed } from '@/lib/auth-roles'

interface SignInOptions {
  allowedRoles?: readonly UserRole[]
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string, options?: SignInOptions) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const isAdminPath = pathname?.startsWith('/admin') && pathname !== '/admin/login'
  const isPortalPath =
    pathname != null && ['/calendar', '/day', '/analysis', '/my-entries', '/profile'].some((path) => pathname.startsWith(path))

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, company:companies(*)')
      .eq('user_id', userId)
      .single()

    if (error) {
      setProfile(null)
      return null
    }

    setProfile(data)
    return data
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return

    const canAccessAdmin = Boolean(profile?.is_active && roleCanAccessAdmin(profile.role))
    const canAccessPortal = Boolean(profile?.is_active && roleCanAccessPortal(profile.role))

    if (isAdminPath && !canAccessAdmin) {
      const search = new URLSearchParams()
      if (session?.user) search.set('error', 'unauthorized')
      const query = search.toString()
      router.replace(query ? `/admin/login?${query}` : '/admin/login')
      return
    }

    if (isPortalPath && !canAccessPortal) {
      const search = new URLSearchParams()
      if (session?.user) search.set('error', 'unauthorized')
      const query = search.toString()
      router.replace(query ? `/login?${query}` : '/login')
    }
  }, [isAdminPath, isPortalPath, loading, pathname, profile, router, session?.user])

  async function signIn(email: string, password: string, options?: SignInOptions) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    const signedInUser = data.user
    if (!signedInUser) throw new Error('Sign in failed: no authenticated user returned.')

    const signedInProfile = await fetchProfile(signedInUser.id)
    if (!signedInProfile) {
      await supabase.auth.signOut()
      throw new Error('Access denied: no application profile exists for this account.')
    }

    if (!signedInProfile.is_active) {
      await supabase.auth.signOut()
      throw new Error('Access denied: this account is inactive.')
    }

    if (options?.allowedRoles && !roleIsAllowed(signedInProfile.role, options.allowedRoles)) {
      await supabase.auth.signOut()
      throw new Error('Access denied: this account does not have access to this area.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
