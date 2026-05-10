'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import {
  buildDayEvents,
  computeDischargeWindows,
  getDaysInMonth,
  formatDuration,
} from '@/lib/shared-utils'
import type { Flight, CruiseSchedule, DischargeWindow } from '@/lib/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth } from 'date-fns'

export default function CalendarPage() {
  const { settings } = useTheme()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [flights, setFlights] = useState<Flight[]>([])
  const [cruises, setCruises] = useState<CruiseSchedule[]>([])
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
        .or(`and(arrival_date.gte.${start},arrival_date.lt.${end}),and(departure_date.gte.${start},departure_date.lt.${end})`)
        .order('arrival_date'),
    ])

    const f = flightData ?? []
    const c = cruiseData ?? []
    setFlights(f)
    setCruises(c)

    const events = buildDayEvents(f, c)
    setWindows(computeDischargeWindows(events, year, month, minHours))
    setLoading(false)
  }, [year, month, minHours])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function prevMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  const days = getDaysInMonth(year, month)
  // Pad start of calendar to begin on Monday
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7 // Mon=0

  // Map windows and events by date
  const windowsByDate = new Map<string, DischargeWindow>()
  windows.forEach((w) => windowsByDate.set(w.date, w))
  const eventsByDate = new Map<string, number>()
  buildDayEvents(flights, cruises).forEach((e) => {
    const d = e.time.slice(0, 10)
    eventsByDate.set(d, (eventsByDate.get(d) ?? 0) + 1)
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {format(startOfMonth(currentDate), 'MMMM yyyy')}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-[var(--color-accent)]" /> Discharge window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-400" /> Longest window this month
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-gray-300" /> Events present
        </span>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-medium text-gray-500">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/50"
              />
            ))}
            {days.map((day) => {
              const win = windowsByDate.get(day)
              const eventCount = eventsByDate.get(day) ?? 0
              const dayNum = parseInt(day.slice(-2))
              const isToday = day === new Date().toISOString().slice(0, 10)

              return (
                <Link
                  key={day}
                  href={`/day/${day}`}
                  className={`group relative min-h-[80px] border-b border-r border-gray-100 p-2 transition-colors hover:bg-blue-50 ${
                    win?.is_longest_of_month
                      ? 'bg-amber-50'
                      : win
                        ? 'bg-[color:oklch(from_var(--color-accent)_l_c_h_/_0.1)]'
                        : ''
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      isToday
                        ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white'
                        : 'text-gray-700'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {win && (
                    <span
                      className={`mt-1 block rounded px-1 py-0.5 text-xs font-medium ${
                        win.is_longest_of_month
                          ? 'bg-amber-200 text-amber-800'
                          : 'bg-[color:oklch(from_var(--color-accent)_l_c_h_/_0.2)] text-[var(--color-primary)]'
                      }`}
                    >
                      {formatDuration(win.duration_hours)}
                    </span>
                  )}
                  {eventCount > 0 && (
                    <span className="mt-1 block text-xs text-gray-400">
                      {eventCount} event{eventCount > 1 ? 's' : ''}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {!loading && windows.length > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          {windows.length} discharge window{windows.length > 1 ? 's' : ''} found this month
          (≥{minHours}h).
        </p>
      )}
    </div>
  )
}
