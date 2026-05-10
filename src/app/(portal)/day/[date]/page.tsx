'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buildDayEvents, computeDischargeWindows, formatDuration } from '@/lib/shared-utils'
import type { DayEvent } from '@/lib/types'
import { useTheme } from '@/contexts/ThemeContext'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, PlaneLanding, PlaneTakeoff, Ship, Clock, TriangleAlert } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatTimeInZone } from '@/lib/utils'

export default function DayDetailPage() {
  const params = useParams()
  const date = params.date as string
  const router = useRouter()
  const { settings } = useTheme()
  const [events, setEvents] = useState<DayEvent[]>([])
  const [loading, setLoading] = useState(true)

  const minHours = settings?.min_discharge_window_hours ?? 4

  const fetchData = useCallback(async () => {
    if (!date) return
    setLoading(true)
    const start = `${date}T00:00:00.000Z`
    const end = `${date}T23:59:59.999Z`

    const [{ data: flightData }, { data: cruiseData }] = await Promise.all([
      supabase
        .from('flights')
        .select('*')
        .gte('scheduled_arrival', start)
        .lte('scheduled_arrival', end)
        .order('scheduled_arrival'),
      supabase
        .from('cruise_schedules')
        .select('*')
        .or(`and(arrival_date.gte.${start},arrival_date.lte.${end}),and(departure_date.gte.${start},departure_date.lte.${end})`)
        .order('arrival_date'),
    ])

    const dayEvents = buildDayEvents(flightData ?? [], cruiseData ?? [])
    setEvents(dayEvents)
    setLoading(false)
  }, [date])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Compute windows just for this day's events
  const allYear = date ? parseInt(date.slice(0, 4)) : new Date().getFullYear()
  const allMonth = date ? parseInt(date.slice(5, 7)) : new Date().getMonth() + 1
  const windows = computeDischargeWindows(events, allYear, allMonth, minHours)

  const formattedDate = date ? format(parseISO(date), 'EEEE, d MMMM yyyy') : ''

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft size={16} />
        Back to calendar
      </button>

      <h1 className="mb-8 text-2xl font-bold text-gray-900">{formattedDate}</h1>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Events timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Events</CardTitle>
            </CardHeader>
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events on this day.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      {event.type === 'flight' ? (event.flight_direction === 'departure' ? <PlaneTakeoff size={12} /> : <PlaneLanding size={12} />) : <Ship size={12} />}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{event.title}</p>
                      <p className="text-xs text-gray-400">
                        {event.type === 'flight' ? (
                          <>
                            {event.flight_direction === 'departure'
                              ? `Scheduled departure: ${event.scheduled_departure ? formatTimeInZone(event.scheduled_departure) : '—'}`
                              : `Scheduled arrival: ${formatTimeInZone(event.scheduled_arrival ?? event.time)}`}
                          </>
                        ) : (
                          <>
                            {event.cruise_direction === 'departure' ? 'Scheduled departure: ' : 'Scheduled arrival: '}
                            {formatTimeInZone(event.time)}
                          </>
                        )}
                        {event.is_private && (
                          <span className="ml-2 rounded bg-gray-100 px-1 py-0.5 text-gray-500">
                            Private
                          </span>
                        )}
                      </p>
                      {event.type === 'flight' && event.delay_minutes && event.delay_minutes > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                          <TriangleAlert size={12} /> Delayed by {event.delay_minutes} min
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Discharge windows */}
          <Card>
            <CardHeader>
              <CardTitle>Discharge Windows</CardTitle>
            </CardHeader>
            {windows.length === 0 ? (
              <p className="text-sm text-gray-400">
                No discharge windows ≥{minHours}h found on this day.
              </p>
            ) : (
              <ol className="space-y-3">
                {windows.map((w, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                      w.is_longest_of_month
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-blue-50 border border-blue-100'
                    }`}
                  >
                    <Clock size={16} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatDuration(w.duration_hours)}
                        {w.is_longest_of_month && (
                          <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-800">
                            Longest this month
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(parseISO(w.start_time), 'HH:mm')} –{' '}
                        {format(parseISO(w.end_time), 'HH:mm')}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
