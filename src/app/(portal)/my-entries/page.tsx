import { Suspense } from 'react'
import MyEntriesClientPage from './MyEntriesClientPage'

export default function MyEntriesPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">Loading...</div>}>
      <MyEntriesClientPage />
    </Suspense>
  )
}
