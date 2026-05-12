'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  buildDayEvents,
  computeDischargeWindows,
  getMissingFlightDates,
  formatDuration,
  toCSV,
  downloadCSV,
} from '@/lib/shared-utils'
import type { DischargeWindow } from '@/lib/types'
import { useTheme } from '@/contexts/ThemeContext'
import { format, startOfMonth } from 'date-fns'
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default function AnalysisPage() {
  const { settings } = useTheme()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [windows, setWindows] = useState<DischargeWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [missingFlightDates, setMissingFlightDates] = useState<string[]>([])
  const [showAllDates, setShowAllDates] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const minHours = settings?.min_discharge_window_hours ?? 4
  const activeMinHours = showAllDates ? 0 : minHours

  const fetchData = useCallback(async () => {
    setLoading(true)
    const monthStartUtc = new Date(Date.UTC(year, month - 1, 1))
    const monthEndUtc = new Date(Date.UTC(year, month, 1))
    const todayUtc = new Date()
    const todayStartUtc = new Date(
      Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()),
    )

    const start =
      year === todayStartUtc.getUTCFullYear() && month === todayStartUtc.getUTCMonth() + 1
        ? todayStartUtc.toISOString()
        : monthStartUtc.toISOString()
    const end = monthEndUtc.toISOString()

    const [{ data: flightData }, { data: cruiseData }] = await Promise.all([
      supabase
        .from('flights')
        .select('*')
        .or(`and(scheduled_arrival.gte.${start},scheduled_arrival.lt.${end}),and(scheduled_departure.gte.${start},scheduled_departure.lt.${end})`)
        .order('scheduled_arrival'),
      supabase
        .from('cruise_schedules')
        .select('*')
        .or(`and(arrival_date.gte.${start},arrival_date.lt.${end}),and(departure_date.gte.${start},departure_date.lt.${end})`)
        .order('arrival_date'),
    ])

    const events = buildDayEvents(flightData ?? [], cruiseData ?? [])
    setWindows(computeDischargeWindows(events, year, month, activeMinHours))
    setMissingFlightDates(getMissingFlightDates(flightData ?? [], year, month))
    setLoading(false)
  }, [year, month, activeMinHours])

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

  const missingFlightDateSet = new Set(missingFlightDates)

  const isEarlyBerthingWindow = (startTime: string) => {
    const start = new Date(startTime)
    const hour = start.getHours()
    return hour >= 21 && hour <= 22
  }

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

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Planning target: maximize the overnight discharge window from <strong>23:00 to 07:00 (8 hours)</strong>.
        Ideal days allow berthing at 21:00–22:00 so vessel prep can complete before discharge starts at 23:00.
      </div>



      {/* Table */}
      {!loading && missingFlightDates.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Missing flight data detected for {missingFlightDates.length} day
          {missingFlightDates.length > 1 ? 's' : ''} this month. Please run API sync and validate
          inbound schedule coverage. Days marked with ! require review because flights are expected every
          day.
          <div className="mt-2 flex flex-wrap gap-2">
            {missingFlightDates.map((date) => (
              <Link
                key={date}
                href={`/day/${date}`}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <AlertTriangle size={12} />
                {format(new Date(date), 'EEE d MMM')}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              All Discharge Windows ({showAllDates ? 'all durations' : `≥${minHours}h`})
            </CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAllDates((prev) => !prev)}
            >
              {showAllDates ? 'Hide shorter dates' : 'Show all dates'}
            </Button>
          </div>
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
                        <span className="inline-flex items-center gap-1">
                          {format(new Date(w.date), 'EEE d MMM')}
                          {missingFlightDateSet.has(w.date) && (
                            <span
                              title="Missing flight data - review required"
                              className="inline-flex items-center text-red-600"
                              aria-label="Missing flight data - review required"
                            >
                              <AlertTriangle size={12} />
                            </span>
                          )}
                        </span>
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
                      <div className="flex flex-wrap gap-2">
                        {w.is_longest_of_month && (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Longest
                          </span>
                        )}
                        {isEarlyBerthingWindow(w.start_time) && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Early Berthing
                          </span>
                        )}
                      </div>
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
