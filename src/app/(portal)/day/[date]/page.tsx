'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  buildDayEvents,
  computeDischargeWindows,
  computeDailySuitability,
  getDayBoundaryEvents,
  getMissingFlightDates,
  formatDuration,
} from '@/lib/shared-utils'
import type { DayEvent, Flight, CruiseSchedule, FerrySchedule, OperationalEvent } from '@/lib/types'
import { useTheme } from '@/contexts/ThemeContext'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ArrowLeft, ArrowRight, PlaneLanding, PlaneTakeoff, Ship, Clock, TriangleAlert, FerrisWheel } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatTimeInZone } from '@/lib/utils'
import { MaritimeWeatherWidget } from '@/components/portal/MaritimeWeatherWidget'
import { fetchMaritimeForecast } from '@/lib/open-meteo'

export default function DayDetailPage() {
  const params = useParams()
  const date = params.date as string
  const router = useRouter()
  const { settings } = useTheme()
  const [events, setEvents] = useState<DayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [suitabilityReasons, setSuitabilityReasons] = useState<string[]>([])
  const [suitabilityColor, setSuitabilityColor] = useState<'green' | 'orange' | 'red' | null>(null)

  const minHours = settings?.min_discharge_window_hours ?? 4

  const fetchData = useCallback(async () => {
    if (!date) return
    setLoading(true)
    const selectedDay = parseISO(`${date}T00:00:00Z`)
    const nextDay = addDays(selectedDay, 1)
    const start = `${format(selectedDay, 'yyyy-MM-dd')}T00:00:00.000Z`
    const end = `${format(nextDay, 'yyyy-MM-dd')}T23:59:59.999Z`

    const [
      { data: flightData },
      { data: cruiseData },
      { data: ferryData },
      { data: opData },
      weatherData,
    ] = await Promise.all([
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
      supabase
        .from('ferries')
        .select('*')
        .or(`and(arrival_time.gte.${start},arrival_time.lte.${end}),and(departure_time.gte.${start},departure_time.lte.${end})`)
        .order('arrival_time'),
      supabase
        .from('operational_events')
        .select('*')
        .or(`and(start_time.gte.${start},start_time.lte.${end}),and(end_time.gte.${start},end_time.lte.${end})`)
        .order('start_time'),
      fetchMaritimeForecast(14),
    ])

    const flights = (flightData ?? []) as Flight[]
    const cruises = (cruiseData ?? []) as CruiseSchedule[]
    const ferries = (ferryData ?? []) as FerrySchedule[]
    const opEvents = (opData ?? []) as OperationalEvent[]

    const dayEvents = buildDayEvents(flights, cruises, ferries, opEvents)
    setEvents(dayEvents)

    const suitability = computeDailySuitability(
      dayEvents,
      selectedDay.getUTCFullYear(),
      selectedDay.getUTCMonth() + 1,
      new Map(weatherData.map((day) => [day.date, day])),
      getMissingFlightDates(flights, selectedDay.getUTCFullYear(), selectedDay.getUTCMonth() + 1),
    ).find((item) => item.date === date)

    setSuitabilityReasons(suitability?.reasons ?? [])
    setSuitabilityColor(suitability?.color ?? null)
    setLoading(false)
  }, [date])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const allYear = date ? parseInt(date.slice(0, 4)) : new Date().getFullYear()
  const allMonth = date ? parseInt(date.slice(5, 7)) : new Date().getMonth() + 1
  const windows = computeDischargeWindows(events, allYear, allMonth, minHours)

  const formattedDate = date ? format(parseISO(date), 'EEEE, d MMMM yyyy') : ''
  const selectedDay = date ? parseISO(`${date}T00:00:00Z`) : new Date()
  const previousDay = subDays(selectedDay, 1)
  const nextDay = addDays(selectedDay, 1)
  const nextDateStr = format(nextDay, 'yyyy-MM-dd')
  const timelineHours = Array.from({ length: 24 }, (_, i) => i)

  const todayBoundary = useMemo(() => getDayBoundaryEvents(events, date ?? ''), [events, date])
  const tomorrowBoundary = useMemo(() => getDayBoundaryEvents(events, nextDateStr), [events, nextDateStr])

  const overnightWindowHours = useMemo(() => {
    if (!todayBoundary.latest || !tomorrowBoundary.earliest) return null
    const latestMs = new Date(todayBoundary.latest.time).getTime()
    const earliestMs = new Date(tomorrowBoundary.earliest.time).getTime()
    const hours = (earliestMs - latestMs) / 3_600_000
    return hours > 0 ? hours : null
  }, [todayBoundary, tomorrowBoundary])

  const moveDay = (day: Date) => {
    router.push(`/day/${format(day, 'yyyy-MM-dd')}`)
  }

  const timelineEvents = events.filter((event) => {
    const eventDate = parseISO(event.time)
    return (
      format(eventDate, 'yyyy-MM-dd') === format(selectedDay, 'yyyy-MM-dd') ||
      format(eventDate, 'yyyy-MM-dd') === format(nextDay, 'yyyy-MM-dd')
    )
  })

  const suitabilityClass = useMemo(() => {
    if (suitabilityColor === 'green') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    if (suitabilityColor === 'orange') return 'border-amber-200 bg-amber-50 text-amber-900'
    if (suitabilityColor === 'red') return 'border-red-200 bg-red-50 text-red-900'
    return 'border-gray-200 bg-gray-50 text-gray-700'
  }, [suitabilityColor])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft size={16} />
        Back to calendar
      </button>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{formattedDate}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveDay(previousDay)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={14} />
            Previous day
          </button>
          <button
            onClick={() => moveDay(nextDay)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Next day
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <MaritimeWeatherWidget selectedDate={date} />

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Key Event Times — the primary data for determining discharge windows */}
          <Card>
            <CardHeader>
              <CardTitle>Key Event Times</CardTitle>
            </CardHeader>
            <p className="mb-3 text-xs text-gray-500">
              The latest event today and the earliest event tomorrow define the potential overnight discharge window.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {format(selectedDay, 'EEE dd MMM')}
                </p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-base">⬆</span>
                  <span className="font-medium">First event:</span>
                  {todayBoundary.earliest ? (
                    <span className="font-semibold text-gray-900">
                      {formatTimeInZone(todayBoundary.earliest.time)}{' '}
                      <span className="font-normal text-gray-500">— {todayBoundary.earliest.title}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">No events</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm">
                  <span className="text-base">⬇</span>
                  <span className="font-medium text-rose-800">Last event:</span>
                  {todayBoundary.latest ? (
                    <span className="font-bold text-rose-900">
                      {formatTimeInZone(todayBoundary.latest.time)}{' '}
                      <span className="font-normal text-rose-700">— {todayBoundary.latest.title}</span>
                    </span>
                  ) : (
                    <span className="text-rose-400">No events</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {format(nextDay, 'EEE dd MMM')} (next day)
                </p>
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm">
                  <span className="text-base">⬆</span>
                  <span className="font-medium text-emerald-800">First event:</span>
                  {tomorrowBoundary.earliest ? (
                    <span className="font-bold text-emerald-900">
                      {formatTimeInZone(tomorrowBoundary.earliest.time)}{' '}
                      <span className="font-normal text-emerald-700">— {tomorrowBoundary.earliest.title}</span>
                    </span>
                  ) : (
                    <span className="text-emerald-600">No events</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-base">⬇</span>
                  <span className="font-medium">Last event:</span>
                  {tomorrowBoundary.latest ? (
                    <span className="font-semibold text-gray-900">
                      {formatTimeInZone(tomorrowBoundary.latest.time)}{' '}
                      <span className="font-normal text-gray-500">— {tomorrowBoundary.latest.title}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">No events</span>
                  )}
                </div>
              </div>
            </div>

            {overnightWindowHours !== null ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <Clock size={18} className="flex-shrink-0 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    Potential overnight window: {formatDuration(overnightWindowHours)}
                  </p>
                  <p className="text-xs text-blue-700">
                    {todayBoundary.latest && formatTimeInZone(todayBoundary.latest.time)} LT (end of last event today) →{' '}
                    {tomorrowBoundary.earliest && formatTimeInZone(tomorrowBoundary.earliest.time)} LT (first event tomorrow)
                  </p>
                </div>
              </div>
            ) : (
              todayBoundary.latest === null && tomorrowBoundary.earliest === null ? (
                <p className="mt-3 text-xs text-gray-400">No events on either day — full day available.</p>
              ) : null
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suitability decision reasons</CardTitle>
            </CardHeader>
            <div className={`rounded-lg border p-3 text-sm ${suitabilityClass}`}>
              <p className="font-semibold">Status: {(suitabilityColor ?? 'unknown').toUpperCase()}</p>
              {suitabilityReasons.length === 0 ? (
                <p className="text-xs">No specific reason code generated for this date.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {suitabilityReasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Events (2-day hourly timeline)</CardTitle>
            </CardHeader>
            <p className="mb-3 text-xs text-gray-500">All times shown are in local time (LT).</p>
            <div className="mb-4 overflow-x-auto">
              <div className="min-w-[720px] rounded-lg border border-gray-200">
                <div className="grid grid-cols-[80px_1fr_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                  <div className="p-2">Hour</div>
                  <div className="p-2">{format(selectedDay, 'EEE dd MMM')}</div>
                  <div className="p-2">{format(nextDay, 'EEE dd MMM')}</div>
                </div>
                {timelineHours.map((hour) => {
                  const inHour = (day: Date) =>
                    timelineEvents.filter((event) => {
                      const dt = parseISO(event.time)
                      return format(dt, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') && dt.getHours() === hour
                    })

                  const dayAEvents = inHour(selectedDay)
                  const dayBEvents = inHour(nextDay)

                  return (
                    <div key={hour} className="grid grid-cols-[80px_1fr_1fr] border-b border-gray-100 text-xs">
                      <div className="border-r border-gray-100 p-2 font-medium text-gray-500">{String(hour).padStart(2, '0')}:00</div>
                      {[dayAEvents, dayBEvents].map((slotEvents, i) => (
                        <div key={i} className="border-r border-gray-100 p-2 last:border-r-0">
                          {slotEvents.length === 0 ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {slotEvents.map((event) => (
                                <li key={event.id} className="rounded bg-blue-50 px-1.5 py-1 text-blue-900">
                                  <Link href={`/my-entries?type=${event.type}&id=${event.id}`} className="underline-offset-2 hover:underline">
                                    {formatTimeInZone(event.time)} {event.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events on this day.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      {event.type === 'flight' ? (event.flight_direction === 'departure' ? <PlaneTakeoff size={12} /> : <PlaneLanding size={12} />) : event.type === 'ferry' ? <FerrisWheel size={12} /> : <Ship size={12} />}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        <Link href={`/my-entries?type=${event.type}&id=${event.id}`} className="underline-offset-2 hover:underline">
                          {event.title}
                        </Link>
                      </p>
                      <p className="text-xs text-gray-400">{formatTimeInZone(event.time)}</p>
                      <p className="text-xs text-gray-500">Source: {event.data_source ?? 'unknown'}</p>
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
                        {format(parseISO(w.end_time), 'HH:mm')} LT
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
