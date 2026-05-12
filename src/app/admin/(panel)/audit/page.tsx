'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatAuditDateTime } from '@/lib/utils'

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) {
      console.error('Failed to load audit logs:', error)
      setLogs([])
      setHasMore(false)
      setLoading(false)
      return
    }

    const rows = data ?? []
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)))
    let profileByUserId = new Map<string, { full_name?: string | null; role?: string | null }>()

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, role')
        .in('user_id', userIds)

      if (profilesError) {
        console.error('Failed to load audit log profiles:', profilesError)
      } else {
        profileByUserId = new Map(
          (profiles ?? []).map((profile) => [
            profile.user_id,
            { full_name: profile.full_name, role: profile.role },
          ]),
        )
      }
    }

    const rowsWithProfiles = rows.map((row) => ({
      ...row,
      profile: row.user_id ? profileByUserId.get(row.user_id) ?? null : null,
    }))
    setLogs(rowsWithProfiles)
    setHasMore(rowsWithProfiles.length === PAGE_SIZE)
    setLoading(false)
  }, [page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Audit Log</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span>Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </CardHeader>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">No audit log entries.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Action</th>
                  <th className="pb-3 pr-4">Table</th>
                  <th className="pb-3">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                      {formatAuditDateTime(log.created_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-700">
                      {(log.profile as { full_name?: string } | null)?.full_name ??
                        log.user_id?.slice(0, 8) ??
                        '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">
                      {log.table_name}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-gray-400">
                      {log.record_id?.slice(0, 8) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
