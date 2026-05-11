'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import {
  buildDayEvents,
  computeDischargeWindows,
  getDaysInMonth,
  getMissingFlightDates,
  formatDuration,
} from '@/lib/shared-utils'
import type { Flight, CruiseSchedule, DischargeWindow } from '@/lib/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MaritimeWeatherWidget } from '@/components/portal/MaritimeWeatherWidget'
import { degreesToArrow, fetchMaritimeForecast, getWeatherPresentation, type MaritimeDailyForecast } from '@/lib/open-meteo'
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns'

type CalendarView = 'month' | 'week' | '2day'

export default function CalendarPage() {
  const { settings } = useTheme()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>('2day')
  const [flights, setFlights] = useState<Flight[]>([])
  const [cruises, setCruises] = useState<CruiseSchedule[]>([])
  const [windows, setWindows] = useState<DischargeWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [missingFlightDates, setMissingFlightDates] = useState<string[]>([])
  const [weatherForecast, setWeatherForecast] = useState<MaritimeDailyForecast[]>([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const minHours = settings?.min_discharge_window_hours ?? 4

  const fetchData = useCallback(async () => {
    setLoading(true)
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const end = new Date(Date.UTC(year, month, 1)).toISOString()

    const [{ data: flightData }, { data: cruiseData }, weatherData] = await Promise.all([
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
      fetchMaritimeForecast(14),
    ])

    const f = flightData ?? []
    const c = cruiseData ?? []
    setFlights(f)
    setCruises(c)

    const events = buildDayEvents(f, c)
    setWindows(computeDischargeWindows(events, year, month, minHours))
    setMissingFlightDates(getMissingFlightDates(f, year, month))
    setWeatherForecast(weatherData)
    setLoading(false)
  }, [year, month, minHours])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function goPrev() {
    setCurrentDate((d) => (view === 'month' ? subMonths(d, 1) : subDays(d, view === 'week' ? 7 : 2)))
  }

  function goNext() {
    setCurrentDate((d) => (view === 'month' ? addMonths(d, 1) : addDays(d, view === 'week' ? 7 : 2)))
  }

  const windowsByDate = useMemo(() => {
    const map = new Map<string, DischargeWindow>()
    windows.forEach((w) => map.set(w.date, w))
    return map
  }, [windows])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, number>()
    buildDayEvents(flights, cruises).forEach((e) => {
      const d = e.time.slice(0, 10)
      map.set(d, (map.get(d) ?? 0) + 1)
    })
    return map
  }, [flights, cruises])

  const weatherByDate = useMemo(() => {
    const map = new Map<string, MaritimeDailyForecast>()
    weatherForecast.forEach((day) => map.set(day.date, day))
    return map
  }, [weatherForecast])

  const monthDays = getDaysInMonth(year, month)
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i), 'yyyy-MM-dd'),
  )
  const visibleDays = view === 'month' ? monthDays : view === 'week' ? weekDays : [format(currentDate, 'yyyy-MM-dd'), format(addDays(currentDate, 1), 'yyyy-MM-dd')]
  const monthHeaderDays = Array.from({ length: 7 }).map((_, i) =>
    format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i), 'EEE'),
  )

  const heading =
    view === 'month'
      ? format(startOfMonth(currentDate), 'MMMM yyyy')
      : view === 'week'
        ? `${format(new Date(`${weekDays[0]}T00:00:00Z`), 'dd MMM')} - ${format(new Date(`${weekDays[6]}T00:00:00Z`), 'dd MMM yyyy')}`
        : `${format(currentDate, 'EEE, dd MMM')} - ${format(addDays(currentDate, 1), 'EEE, dd MMM yyyy')}`

  const visibleDaySet = new Set(visibleDays)
  const dayWindows = windows.filter(
    (w) => visibleDaySet.has(w.date) || visibleDaySet.has(w.end_time.slice(0, 10)),
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <MaritimeWeatherWidget />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <div className="flex items-center gap-2">
          {(['2day', 'week', 'month'] as CalendarView[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-[var(--color-primary)] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {v === '2day' ? '2 day' : v === 'week' ? '7 day' : 'Month'}
            </button>
          ))}
          <button onClick={goPrev} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Previous">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Today</button>
          <button onClick={goNext} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Next">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[var(--color-accent)]" /> Discharge window starts</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-blue-200" /> Continues into next day</span>
        <span>All times shown are in local time (LT).</span>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className={`grid ${view === '2day' ? 'grid-cols-2' : 'grid-cols-7'} border-b border-gray-200 bg-gray-50 text-center text-xs font-medium text-gray-500`}>
            {(view === 'month' ? monthHeaderDays : visibleDays).map((d) => (
              <div key={d} className="py-2">{view === 'month' ? d : format(new Date(`${d}T00:00:00Z`), 'EEE dd')}</div>
            ))}
          </div>
          <div className={`grid ${view === '2day' ? 'grid-cols-2' : 'grid-cols-7'}`}>
            {visibleDays.map((day) => {
              const win = windowsByDate.get(day)
              const continuesFromPrevious = windows.some((w) => w.end_time.slice(0, 10) === day && w.date !== day)
              const eventCount = eventsByDate.get(day) ?? 0
              const isToday = isSameDay(new Date(`${day}T00:00:00Z`), startOfDay(new Date()))
              const weather = weatherByDate.get(day)
              const weatherInfo = weather ? getWeatherPresentation(weather.weatherCode) : null
              return (
                <Link key={day} href={`/day/${day}`} className={`group relative min-h-[110px] border-b border-r border-gray-100 p-2 transition-colors hover:bg-blue-50 ${win ? 'bg-[color:oklch(from_var(--color-accent)_l_c_h_/_0.1)]' : continuesFromPrevious ? 'bg-blue-50' : ''}`}>
                  <span className={`text-sm font-medium ${isToday ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white' : 'text-gray-700'}`}>{format(new Date(`${day}T00:00:00Z`), 'd')}</span>
                  {win && <span className="mt-1 block rounded bg-[color:oklch(from_var(--color-accent)_l_c_h_/_0.2)] px-1 py-0.5 text-xs font-medium text-[var(--color-primary)]">Starts {format(new Date(win.start_time), 'HH:mm')} → {format(new Date(win.end_time), 'HH:mm')} LT ({formatDuration(win.duration_hours)})</span>}
                  {continuesFromPrevious && <span className="mt-1 block rounded bg-blue-100 px-1 py-0.5 text-xs font-medium text-blue-800">Window completes this morning</span>}
                  {weatherInfo && weather && (
                    <div className={`mt-1 rounded px-1 py-0.5 text-xs ${weatherInfo.isAdverse ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'}`}>
                      <div className="inline-flex items-center gap-1">{weatherInfo.icon} {weatherInfo.label}</div>
                      <div>Wind {degreesToArrow(weather.windDirectionDominant)} {weather.windSpeedMax?.toFixed(0) ?? '—'} kn</div>
                      <div>Wave {degreesToArrow(weather.waveDirectionDominant)} {weather.waveHeightMax?.toFixed(1) ?? '—'} m / {weather.wavePeriodMax?.toFixed(1) ?? '—'} s</div>
                    </div>
                  )}
                  {eventCount > 0 && <span className="mt-1 block text-xs text-gray-400">{eventCount} event{eventCount > 1 ? 's' : ''}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {view === '2day' && !loading && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <p className="font-medium">Overnight windows touching these days: {dayWindows.length}</p>
          {dayWindows.map((w) => (
            <p key={`${w.start_time}-${w.end_time}`}>• {format(new Date(w.start_time), 'dd MMM HH:mm')} to {format(new Date(w.end_time), 'dd MMM HH:mm')} LT ({formatDuration(w.duration_hours)})</p>
          ))}
        </div>
      )}
    </div>
  )
}
