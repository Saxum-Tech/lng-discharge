'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { LogOut, User, Menu, X, Shield } from 'lucide-react'
import { useState } from 'react'

const navLinks = [
  { href: '/calendar', label: 'Calendar' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/my-entries', label: 'My Entries' },
]

export function Navbar() {
  const { profile, signOut } = useAuth()
  const { settings } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + App name */}
        <Link href="/" className="flex items-center gap-2">
          <img src={settings?.logo_url ?? '/turner-logo.jpg'} alt="Turner & Co logo" className="h-[60px] w-auto" />
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-gray-500">Turner &amp; Co (Gibraltar) Ltd</p>
            <span className="text-lg font-semibold text-gray-900">
              {settings?.app_name ?? 'LNG Discharge Planner'}
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User menu */}
        <div className="flex items-center gap-2">
          {profile?.role === 'superadmin' && (
            <Link
              href="/admin/companies"
              className="hidden items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 md:flex"
            >
              <Shield size={16} />
              Backoffice
            </Link>
          )}
          <Link
            href="/profile"
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 md:flex"
          >
            <User size={16} />
            {profile?.full_name ?? 'Profile'}
          </Link>
          <button
            onClick={handleSignOut}
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 md:flex"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>

          {/* Mobile hamburger */}
          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-200 bg-white px-4 pb-4 md:hidden">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </Link>
            )
          })}
          <hr className="my-2" />
          {profile?.role === 'superadmin' && (
            <Link
              href="/admin/companies"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Backoffice
            </Link>
          )}
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Profile
          </Link>
          <button
            onClick={handleSignOut}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
