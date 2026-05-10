'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  buildDayEvents,
  computeDischargeWindows,
  formatDuration,
  toCSV,
  downloadCSV,
} from '@/lib/shared-utils'
import type { DischargeWindow } from '@/lib/types'
import { useTheme } from '@/contexts/ThemeContext'
import { format, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default function AnalysisPage() {
  const { settings } = useTheme()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [windows, setWindows] = useState<DischargeWindow[]>([])
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const minHours = settings?.min_discharge_window_hours ?? 4

  const fetchData = useCallback(async () => {
    setLoading(true)
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const end = new Date(Date.UTC(year, month, 1)).toISOString()

    const [{ data: flightData }, { data: cruiseData }] = await Promise.all([
      supabase
        .from('flights')
        .select('*')
        .or(`and(scheduled_arrival.gte.${start},scheduled_arrival.lt.${end}),and(scheduled_departure.gte.${start},scheduled_departure.lt.${end})`)
        .order('scheduled_arrival'),
      supabase
        .from('cruise_schedules')
        .select('*')
        .gte('arrival_date', start)
        .lt('arrival_date', end)
        .order('arrival_date'),
    ])

    const events = buildDayEvents(flightData ?? [], cruiseData ?? [])
    setWindows(computeDischargeWindows(events, year, month, minHours))
    setLoading(false)
  }, [year, month, minHours])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleExport() {
    const rows = windows.map((w) => ({
      Date: w.date,
      'Start Time': w.start_time,
      'End Time': w.end_time,
      'Duration (hours)': w.duration_hours,
      'Longest This Month': w.is_longest_of_month ? 'Yes' : 'No',
    }))
    downloadCSV(
      `discharge-windows-${year}-${String(month).padStart(2, '0')}.csv`,
      toCSV(rows),
    )
  }

  const longest = windows.find((w) => w.is_longest_of_month)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Analysis</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-gray-700">
              {format(startOfMonth(currentDate), 'MMMM yyyy')}
            </span>
            <button
              onClick={() =>
                setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={windows.length === 0}
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Highlight card */}
      {longest && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
            Longest discharge window this month
          </p>
          <p className="mt-1 text-3xl font-bold text-amber-800">
            {formatDuration(longest.duration_hours)}
          </p>
          <p className="text-sm text-amber-600">
            {format(new Date(longest.start_time), 'EEEE d MMM, HH:mm')} –{' '}
            {format(new Date(longest.end_time), 'HH:mm')}
          </p>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Discharge Windows (≥{minHours}h)</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
          </div>
        ) : windows.length === 0 ? (
          <p className="text-sm text-gray-400">No discharge windows found for this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Start</th>
                  <th className="pb-3 pr-4">End</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {windows.map((w, i) => (
                  <tr
                    key={i}
                    className={`${w.is_longest_of_month ? 'bg-amber-50' : ''} hover:bg-gray-50`}
                  >
                    <td className="py-3 pr-4 font-medium">
                      <Link
                        href={`/day/${w.date}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {format(new Date(w.date), 'EEE d MMM')}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {format(new Date(w.start_time), 'HH:mm')}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {format(new Date(w.end_time), 'HH:mm')}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-gray-900">
                      {formatDuration(w.duration_hours)}
                    </td>
                    <td className="py-3">
                      {w.is_longest_of_month && (
                        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Longest
                        </span>
                      )}
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
