import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'LNG Discharge Planner',
  description: 'LNG Discharge Window Planning Application',
  icons: {
    icon: '/turner-logo.jpg',
    shortcut: '/turner-logo.jpg',
    apple: '/turner-logo.jpg',
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
