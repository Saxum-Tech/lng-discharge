'use client'

import { useTheme } from '@/contexts/ThemeContext'

export function PortalFooter() {
  const { settings } = useTheme()
  if (!settings?.footer_text) return null
  return (
    <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
      {settings.footer_text}
    </footer>
  )
}
