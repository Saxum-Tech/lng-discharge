'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Settings, Building2, Users, ScrollText, LogOut, Sliders, Monitor, CalendarDays } from 'lucide-react'

const navItems = [
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings/branding', label: 'Branding', icon: Settings },
  { href: '/admin/settings/system', label: 'System', icon: Sliders },
  { href: '/admin/events-log', label: 'Events Log', icon: CalendarDays },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
]

export function Sidebar() {
  const { signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    await signOut()
    router.push('/admin/login')
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-700 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white p-1">
          <img src="/turner-logo.png" alt="Turner & Co logo" className="h-full w-full object-contain" />
        </div>
        <span className="text-sm font-semibold">Admin Console</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>


      <div className="px-3 pb-2">
        <Link
          href="/calendar"
          className="flex items-center gap-3 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2.5 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/20"
        >
          <Monitor size={16} />
          Go to Frontend
        </Link>
      </div>

      {/* Sign out */}
      <div className="border-t border-gray-700 p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
