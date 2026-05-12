'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { formatAuditDateTime } from '@/lib/utils'

const PAGE_SIZE = 50

type ActionFilter = 'all' | 'INSERT' | 'UPDATE' | 'DELETE'

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [tableFilter, setTableFilter] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const hasMore = (page + 1) * PAGE_SIZE < totalRows
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  const fetchData = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter)
    }

    if (tableFilter !== 'all') {
      query = query.eq('table_name', tableFilter)
    }

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00`)
    }

    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59`)
    }

    const trimmedSearch = searchTerm.trim()
    if (trimmedSearch) {
      const escaped = trimmedSearch.replaceAll(',', ' ')
      query = query.or(
        `action.ilike.%${escaped}%,table_name.ilike.%${escaped}%,record_id.ilike.%${escaped}%,user_id.ilike.%${escaped}%`,
      )
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Failed to load audit logs:', error)
      setLogs([])
      setTotalRows(0)
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
    setTotalRows(count ?? 0)
    setLoading(false)
  }, [page, actionFilter, tableFilter, startDate, endDate, searchTerm])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(0)
  }, [searchTerm, actionFilter, tableFilter, startDate, endDate])

  const tableOptions = useMemo(() => {
    const knownTables = Array.from(new Set(logs.map((log) => log.table_name).filter(Boolean)))
    return knownTables.sort((a, b) => a.localeCompare(b))
  }, [logs])

  const handleExport = () => {
    if (logs.length === 0) return

    const header = ['created_at', 'user', 'action', 'table_name', 'record_id']
    const rows = logs.map((log) => {
      const user =
        (log.profile as { full_name?: string } | null)?.full_name ?? log.user_id?.slice(0, 8) ?? '—'
      return [log.created_at, user, log.action, log.table_name, log.record_id ?? '']
    })

    const csvContent = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-log-page-${page + 1}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Audit Log</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Recent activity</CardTitle>
            <button
              onClick={handleExport}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search action, table, record, user"
                className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All actions</option>
              <option value="INSERT">Insert</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>

            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All tables</option>
              {tableOptions.map((tableName) => (
                <option key={tableName} value={tableName}>
                  {tableName}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </CardHeader>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
          </div>
        ) : logs.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-gray-400">No audit log entries.</p>
        ) : (
          <>
            <div className="overflow-x-auto px-6 pb-4">
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
                      <td className="py-2.5 pr-4 whitespace-nowrap text-gray-500">
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
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">{log.table_name}</td>
                      <td className="py-2.5 font-mono text-xs text-gray-400">
                        {log.record_id?.slice(0, 8) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 text-sm text-gray-600">
              <span>
                Showing {Math.min(page * PAGE_SIZE + 1, totalRows)}-
                {Math.min((page + 1) * PAGE_SIZE, totalRows)} of {totalRows}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
