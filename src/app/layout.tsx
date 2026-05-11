import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'LNG Discharge Planner',
  description: 'LNG Discharge Window Planning Application',
  icons: {
    icon: '/turner-logo.png',
    shortcut: '/turner-logo.png',
    apple: '/turner-logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
