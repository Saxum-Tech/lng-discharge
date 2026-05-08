import { Navbar } from '@/components/portal/Navbar'
import { PortalFooter } from '@/components/portal/PortalFooter'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">{children}</main>
      <PortalFooter />
    </div>
  )
}
