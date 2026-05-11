'use client'

import { useTheme } from '@/contexts/ThemeContext'

const ownershipText = '© Turner & Co (Gibraltar) Ltd'

export function PortalFooter() {
  const { settings } = useTheme()

  return (
    <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
      {settings?.footer_text && <p>{settings.footer_text}</p>}
      <p>{ownershipText}</p>
    </footer>
  )
}
