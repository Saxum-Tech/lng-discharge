'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  buildDayEvents,
  computeDischargeWindows,
  computeDailySuitability,
  getDaysInMonth,
  getMissingFlightDates,
  formatDuration,
} from '@/lib/shared-utils'
import type {
  Flight,
  CruiseSchedule,
  FerrySchedule,
  OperationalEvent,
  DischargeWindow,
  DaySuitability,
  PlannedDischarge,
  PlannedDischargeStatus,
} from '@/lib/types'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { MaritimeWeatherWidget } from '@/components/portal/MaritimeWeatherWidget'
import { degreesToArrow, fetchMaritimeForecast, getWeatherPresentation, type MaritimeDailyForecast } from '@/lib/open-meteo'
import { formatAuditDateTime } from '@/lib/utils'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns'

type CalendarView = 'month' | 'week' | '2day'

const DISCHARGE_STATUSES: PlannedDischargeStatus[] = ['planned', 'confirmed', 'in_progress', 'completed', 'cancelled']

export default function CalendarPage() {
  const { settings } = useTheme()
  const { profile, user } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>('2day')
  const [flights, setFlights] = useState<Flight[]>([])
  const [cruises, setCruises] = useState<CruiseSchedule[]>([])
  const [ferries, setFerries] = useState<FerrySchedule[]>([])
  const [operationalEvents, setOperationalEvents] = useState<OperationalEvent[]>([])
  const [plannedDischarges, setPlannedDischarges] = useState<PlannedDischarge[]>([])
  const [windows, setWindows] = useState<DischargeWindow[]>([])
  const [suitability, setSuitability] = useState<DaySuitability[]>([])
  const [loading, setLoading] = useState(true)
  const [missingFlightDates, setMissingFlightDates] = useState<string[]>([])
  const [weatherForecast, setWeatherForecast] = useState<MaritimeDailyForecast[]>([])
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [editingDischarge, setEditingDischarge] = useState<PlannedDischarge | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const minHours = settings?.min_discharge_window_hours ?? 4

  const fetchData = useCallback(async () => {
    setLoading(true)
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const end = new Date(Date.UTC(year, month, 1)).toISOString()

    const [
      { data: flightData },
      { data: cruiseData },
      { data: ferryData },
      { data: opEventData },
      { data: dischargeData },
      weatherData,
    ] = await Promise.all([
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
      supabase
        .from('ferries')
        .select('*')
        .or(`and(arrival_time.gte.${start},arrival_time.lt.${end}),and(departure_time.gte.${start},departure_time.lt.${end})`)
        .order('arrival_time'),
      supabase
        .from('operational_events')
        .select('*')
        .or(`and(start_time.gte.${start},start_time.lt.${end}),and(end_time.gte.${start},end_time.lt.${end})`)
        .order('start_time'),
      supabase
        .from('planned_discharges')
        .select('*')
        .gte('discharge_date', format(subDays(new Date(), 3), 'yyyy-MM-dd'))
        .order('discharge_date'),
      fetchMaritimeForecast(14),
    ])

    const f = flightData ?? []
    const c = cruiseData ?? []
    const ferriesData = ferryData ?? []
    const ops = opEventData ?? []
    const discharges = dischargeData ?? []

    setFlights(f)
    setCruises(c)
    setFerries(ferriesData)
    setOperationalEvents(ops)
    setPlannedDischarges(discharges)

    const events = buildDayEvents(f, c, ferriesData, ops)
    setWindows(computeDischargeWindows(events, year, month, minHours))

    const missing = getMissingFlightDates(f, year, month)
    setMissingFlightDates(missing)
    setWeatherForecast(weatherData)
    setSuitability(
      computeDailySuitability(
        events,
        year,
        month,
        new Map(weatherData.map((day) => [day.date, day])),
        missing,
      ),
    )
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

  const suitabilityByDate = useMemo(() => {
    const map = new Map<string, DaySuitability>()
    suitability.forEach((s) => map.set(s.date, s))
    return map
  }, [suitability])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, number>()
    buildDayEvents(flights, cruises, ferries, operationalEvents).forEach((e) => {
      const d = e.time.slice(0, 10)
      map.set(d, (map.get(d) ?? 0) + 1)
    })
    return map
  }, [flights, cruises, ferries, operationalEvents])

  const weatherByDate = useMemo(() => {
    const map = new Map<string, MaritimeDailyForecast>()
    weatherForecast.forEach((day) => map.set(day.date, day))
    return map
  }, [weatherForecast])

  const monthDays = getDaysInMonth(year, month)
  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    }).map((d) => format(d, 'yyyy-MM-dd'))
  }, [currentDate])
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i), 'yyyy-MM-dd'),
  )
  const visibleDays =
    view === 'month'
      ? monthGridDays
      : view === 'week'
        ? weekDays
        : [format(currentDate, 'yyyy-MM-dd'), format(addDays(currentDate, 1), 'yyyy-MM-dd')]
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

  const upcomingDischarges = plannedDischarges
    .filter((d) => d.status !== 'completed' && d.status !== 'cancelled')
    .slice(0, 20)

  const openCreateDischarge = () => {
    setEditingDischarge(null)
    setShowDischargeModal(true)
  }

  const openEditDischarge = (row: PlannedDischarge) => {
    if (profile?.company_id && row.company_id !== profile.company_id && profile.role !== 'superadmin') return
    setEditingDischarge(row)
    setShowDischargeModal(true)
  }

  const colorClasses: Record<DaySuitability['color'], string> = {
    green: 'bg-emerald-50',
    orange: 'bg-amber-50',
    red: 'bg-red-50',
  }
  const colorBadgeClasses: Record<DaySuitability['color'], string> = {
    green: 'bg-emerald-200 text-emerald-900',
    orange: 'bg-amber-200 text-amber-900',
    red: 'bg-red-200 text-red-900',
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-300" /> Green: early berthing (21:00) possible</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-300" /> Orange: berthing starts at 23:00+</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-300" /> Red: no suitable 23:00+ window or weather block</span>
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
              const daySuitability = suitabilityByDate.get(day)
              const eventCount = eventsByDate.get(day) ?? 0
              const isToday = isSameDay(new Date(`${day}T00:00:00Z`), startOfToday())
              const isInCurrentMonth = monthDays.includes(day)
              const weather = weatherByDate.get(day)
              const weatherInfo = weather ? getWeatherPresentation(weather.weatherCode) : null
              return (
                <Link key={day} href={`/day/${day}`} className={`group relative min-h-[150px] border-b border-r border-gray-100 p-2 transition-colors hover:bg-blue-50 ${!isInCurrentMonth ? 'bg-gray-50 text-gray-400' : daySuitability ? colorClasses[daySuitability.color] : ''}`}>
                  <span className={`text-sm font-medium ${isToday ? 'flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-white' : isInCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}>{format(new Date(`${day}T00:00:00Z`), 'd')}</span>
                  {daySuitability && (
                    <span className={`mt-1 block rounded px-1 py-0.5 text-xs font-semibold ${colorBadgeClasses[daySuitability.color]}`}>
                      {daySuitability.color.toUpperCase()} {daySuitability.recommended_berthing_time ? `• ${format(parseISO(daySuitability.recommended_berthing_time), 'HH:mm')}` : ''}
                    </span>
                  )}
                  {daySuitability?.reasons?.slice(0, 2).map((reason) => (
                    <span key={reason} className="mt-1 block text-[10px] text-gray-700">
                      • {reason}
                    </span>
                  ))}
                  {win && <span className="mt-1 block rounded bg-[color:oklch(from_var(--color-accent)_l_c_h_/_0.2)] px-1 py-0.5 text-xs font-medium text-[var(--color-primary)]">Window {format(new Date(win.start_time), 'HH:mm')} → {format(new Date(win.end_time), 'HH:mm')} ({formatDuration(win.duration_hours)})</span>}
                  {weatherInfo && weather && (
                    <div className={`mt-1 rounded px-1 py-0.5 text-xs ${daySuitability?.is_weather_blocked ? 'bg-red-100 text-red-900' : weatherInfo.isAdverse ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'}`}>
                      <div className="inline-flex items-center gap-1">{weatherInfo.icon} {weatherInfo.label}</div>
                      <div>Wind {degreesToArrow(weather.windDirectionDominant)} {weather.windSpeedMax?.toFixed(0) ?? '—'} kn</div>
                      <div>Wave {degreesToArrow(weather.waveDirectionDominant)} {weather.waveHeightMax?.toFixed(1) ?? '—'} m</div>
                    </div>
                  )}
                  {eventCount > 0 && <span className="mt-1 block text-xs text-gray-500">{eventCount} event{eventCount > 1 ? 's' : ''}</span>}
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
          {missingFlightDates.length > 0 && (
            <p className="mt-2 text-xs text-red-700">
              Missing flight coverage on {missingFlightDates.length} day(s) this month.
            </p>
          )}
        </div>
      )}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming LNG Discharges</h2>
          <button
            onClick={openCreateDischarge}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={14} /> Add discharge
          </button>
        </div>

        {upcomingDischarges.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming LNG discharges scheduled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Target</th>
                  <th className="pb-3 pr-4">Vessel</th>
                  <th className="pb-3 pr-4">Approx qty (m³)</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Audit</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingDischarges.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">{format(parseISO(`${row.discharge_date}T00:00:00Z`), 'dd/MM/yy')}</td>
                    <td className="py-3 pr-4 text-gray-600">{row.alongside_target_at.slice(0, 5)}</td>
                    <td className="py-3 pr-4 text-gray-900">{row.vessel_name}</td>
                    <td className="py-3 pr-4 text-gray-900">{row.approx_quantity_m3.toLocaleString('en-GB')}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{row.status.replaceAll('_', ' ')}</span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      <div>Added {formatAuditDateTime(row.created_at)}</div>
                      <div>Updated {formatAuditDateTime(row.updated_at)}</div>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => openEditDischarge(row)}
                        disabled={profile?.role !== 'superadmin' && profile?.company_id !== row.company_id}
                        className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showDischargeModal && (
        <DischargeModal
          companyId={profile?.company_id ?? null}
          userId={user?.id ?? null}
          editItem={editingDischarge}
          onClose={() => setShowDischargeModal(false)}
          onSaved={() => {
            setShowDischargeModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function DischargeModal({
  companyId,
  userId,
  editItem,
  onClose,
  onSaved,
}: {
  companyId: string | null
  userId: string | null
  editItem: PlannedDischarge | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(editItem?.discharge_date ?? format(new Date(), 'yyyy-MM-dd'))
  const [target, setTarget] = useState(editItem?.alongside_target_at?.slice(0, 5) ?? '23:00')
  const [vessel, setVessel] = useState(editItem?.vessel_name ?? '')
  const [quantity, setQuantity] = useState(String(editItem?.approx_quantity_m3 ?? ''))
  const [status, setStatus] = useState<PlannedDischargeStatus>(editItem?.status ?? 'planned')
  const [notes, setNotes] = useState(editItem?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSave = Boolean(companyId && userId && vessel.trim().length > 0 && quantity.trim().length > 0)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave || !companyId || !userId) return

    const parsedQty = Number.parseFloat(quantity)
    if (Number.isNaN(parsedQty) || parsedQty < 0) {
      setError('Approx quantity must be a positive number.')
      return
    }

    const basePayload = {
      company_id: companyId,
      discharge_date: date,
      alongside_target_at: `${target || '23:00'}:00`,
      vessel_name: vessel.trim(),
      approx_quantity_m3: parsedQty,
      status,
      notes: notes.trim() || null,
      updated_by: userId,
    }

    setSaving(true)
    setError('')

    const query = editItem
      ? supabase.from('planned_discharges').update(basePayload).eq('id', editItem.id)
      : supabase.from('planned_discharges').insert({ ...basePayload, created_by: userId })

    const { error: saveError } = await query

    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editItem ? 'Edit discharge plan' : 'Add discharge plan'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Target alongside
              <input
                type="time"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Vessel
            <input
              value={vessel}
              onChange={(e) => setVessel(e.target.value)}
              required
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Approx quantity (m³)
              <input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlannedDischargeStatus)}
                className="rounded-lg border border-gray-300 px-3 py-2"
              >
                {DISCHARGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave || saving}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
