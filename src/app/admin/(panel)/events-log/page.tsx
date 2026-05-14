'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { CruiseSchedule, DayEvent, FerrySchedule, Flight, OperationalEvent, OperationalEventType, PlannedDischarge } from '@/lib/types'
import { buildDayEvents } from '@/lib/shared-utils'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Eye, EyeOff, Fuel } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const EVENT_TYPES: OperationalEventType[] = ['private_flight', 'ferry', 'port_constraint', 'other']

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type EventFormState = {
  id?: string
  title: string
  event_type: OperationalEventType
  start_time: string
  end_time: string
  blocks_discharge: boolean
  is_private: boolean
  notes: string
}

function toLocalInputValue(iso: string) {
  const date = new Date(iso)
  const tzOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16)
}

function toUtcIso(localValue: string) {
  return new Date(localValue).toISOString()
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatIsoTime(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return fallback
  return format(date, 'HH:mm')
}

export default function EventsLogPage() {
  const { profile, user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [events, setEvents] = useState<OperationalEvent[]>([])
  const [timelineEvents, setTimelineEvents] = useState<DayEvent[]>([])
  const [plannedDischarges, setPlannedDischarges] = useState<PlannedDischarge[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<EventFormState | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const [{ data: operationalData }, { data: flightsData }, { data: cruisesData }, { data: ferriesData }, { data: dischargesData }] = await Promise.all([
      supabase.from('operational_events').select('*').order('start_time'),
      supabase.from('flights').select('*'),
      supabase.from('cruise_schedules').select('*'),
      supabase.from('ferries').select('*'),
      supabase.from('planned_discharges').select('*'),
    ])

    const operationalEvents = (operationalData ?? []) as OperationalEvent[]
    const flights = (flightsData ?? []) as Flight[]
    const cruises = (cruisesData ?? []) as CruiseSchedule[]
    const ferries = (ferriesData ?? []) as FerrySchedule[]
    const discharges = (dischargesData ?? []) as PlannedDischarge[]

    setEvents(operationalEvents)
    setTimelineEvents(buildDayEvents(flights, cruises, ferries, operationalEvents))
    setPlannedDischarges(discharges)
    setSelectedIds(new Set())
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const byDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    timelineEvents.forEach((event) => {
      const day = event.time.slice(0, 10)
      const list = map.get(day) ?? []
      list.push(event)
      map.set(day, list)
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [timelineEvents])

  const eventDaySet = useMemo(() => new Set(byDate.map(([date]) => date)), [byDate])

  const firstEventDate = byDate.length > 0 ? parseISO(byDate[0][0]) : null
  const lastEventDate = byDate.length > 0 ? parseISO(byDate[byDate.length - 1][0]) : null

  const visibleGroups = useMemo(() => {
    if (selectedDate) {
      return byDate.filter(([date]) => date === selectedDate)
    }

    const monthKey = format(currentMonth, 'yyyy-MM')
    return byDate.filter(([date]) => date.startsWith(monthKey))
  }, [byDate, currentMonth, selectedDate])

  const daysInView = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const totalDays = endOfMonth(currentMonth).getDate()
    const leadingBlank = start.getDay()

    const rows: Array<{ day: number; key: string; inRange: boolean; hasData: boolean }> = []

    for (let i = 0; i < leadingBlank; i += 1) {
      rows.push({ day: 0, key: `blank-${i}`, inRange: false, hasData: false })
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), day))
      const key = toDayKey(date)
      const inRange = !!firstEventDate && !!lastEventDate && date >= firstEventDate && date <= lastEventDate
      rows.push({ day, key, inRange, hasData: eventDaySet.has(key) })
    }

    return rows
  }, [currentMonth, eventDaySet, firstEventDate, lastEventDate])

  const canGoPrev = firstEventDate ? startOfMonth(subMonths(currentMonth, 1)) >= startOfMonth(firstEventDate) : false
  const canGoNext = lastEventDate ? startOfMonth(addMonths(currentMonth, 1)) <= startOfMonth(lastEventDate) : false

  async function saveEvent() {
    if (!form || !profile?.company_id || !user?.id) return

    const payload = {
      title: form.title,
      event_type: form.event_type,
      start_time: toUtcIso(form.start_time),
      end_time: form.end_time ? toUtcIso(form.end_time) : null,
      blocks_discharge: form.blocks_discharge,
      is_private: form.is_private,
      notes: form.notes || null,
      company_id: profile.company_id,
      created_by: user.id,
      data_source: 'manual_ui',
    }

    if (form.id) {
      await supabase.from('operational_events').update(payload).eq('id', form.id)
    } else {
      await supabase.from('operational_events').insert(payload)
    }

    setForm(null)
    await fetchEvents()
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    await supabase.from('operational_events').delete().in('id', [...selectedIds])
    await fetchEvents()
  }

  async function toggleVisibility(event: OperationalEvent) {
    await supabase.from('operational_events').update({ is_private: !event.is_private }).eq('id', event.id)
    await fetchEvents()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events Log</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm({ title: '', event_type: 'other', start_time: `${format(currentMonth, 'yyyy-MM')}-01T08:00`, end_time: '', blocks_discharge: false, is_private: false, notes: '' })} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white"><Plus size={14} />Add</button>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button disabled={!canGoPrev} onClick={() => setCurrentMonth(startOfMonth(subMonths(currentMonth, 1)))} className="rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
            <h2 className="text-sm font-semibold text-gray-800">{format(currentMonth, 'MMMM yyyy')}</h2>
            <button disabled={!canGoNext} onClick={() => setCurrentMonth(startOfMonth(addMonths(currentMonth, 1)))} className="rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
          {selectedDate && <button onClick={() => setSelectedDate(null)} className="text-xs text-indigo-600 hover:underline">Clear date filter</button>}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAY_HEADERS.map((name) => <div key={name} className="py-1 font-medium text-gray-500">{name}</div>)}
          {daysInView.map((cell) => {
            if (cell.day === 0) return <div key={cell.key} className="h-8" />

            const isSelected = selectedDate === cell.key
            const isDisabled = !cell.inRange || !cell.hasData

            return (
              <button
                key={cell.key}
                disabled={isDisabled}
                onClick={() => setSelectedDate(cell.key)}
                className={`h-8 rounded text-xs ${isSelected ? 'bg-indigo-600 text-white' : ''} ${isDisabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
              >
                {cell.day}
              </button>
            )
          })}
        </div>
      </div>

      <button onClick={() => void deleteSelected()} className="mb-4 inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50" disabled={selectedIds.size === 0}><Trash2 size={14} />Delete selected ({selectedIds.size})</button>
      {loading ? <p className="text-sm text-gray-500">Loading...</p> : (
        <div className="space-y-4">
          {visibleGroups.length === 0 && <p className="text-sm text-gray-500">No events for this period.</p>}
          {visibleGroups.map(([date, dayEvents]) => {
            const operationalForDay = dayEvents
              .map((item) => events.find((event) => event.id === item.id))
              .filter((event): event is OperationalEvent => !!event)
            const plannedForDay = plannedDischarges.filter((item) => item.discharge_date.slice(0, 10) === date)

            return (
              <section key={date} className="rounded-lg border border-gray-200 bg-white">
                <header className="border-b border-gray-100 px-4 py-3 font-semibold">{format(parseISO(date), 'EEEE, d MMMM yyyy')}</header>

                {dayEvents.filter((event) => event.type !== 'operational').map((event) => (
                  <div key={`timeline-${event.id}`} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-gray-500">{event.type} · {formatIsoTime(event.time)} {event.end_time ? `- ${formatIsoTime(event.end_time)}` : ''} · {event.data_source ?? 'manual'}</p>
                    </div>
                  </div>
                ))}

                {plannedForDay.map((discharge) => (
                  <div key={`discharge-${discharge.id}`} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                    <div className="flex-1">
                      <p className="flex items-center gap-1 text-sm font-medium"><Fuel size={14} /> Planned discharge — {discharge.vessel_name}</p>
                      <p className="text-xs text-gray-500">planned_discharge · {formatIsoTime(discharge.alongside_target_at)} · {discharge.status}</p>
                    </div>
                  </div>
                ))}

                {operationalForDay.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                    <input type="checkbox" checked={selectedIds.has(event.id)} onChange={(e) => { const n = new Set(selectedIds); e.target.checked ? n.add(event.id) : n.delete(event.id); setSelectedIds(n) }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Admin override: {event.title}</p>
                      <p className="text-xs text-gray-500">{event.event_type} · {formatIsoTime(event.start_time)} {event.end_time ? `- ${formatIsoTime(event.end_time)}` : ''} · {event.data_source}</p>
                    </div>
                    <button onClick={() => void toggleVisibility(event)} className="rounded p-2 hover:bg-gray-100">{event.is_private ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    <button onClick={() => setForm({ id: event.id, title: event.title, event_type: event.event_type, start_time: toLocalInputValue(event.start_time), end_time: event.end_time ? toLocalInputValue(event.end_time) : '', blocks_discharge: event.blocks_discharge, is_private: event.is_private, notes: event.notes ?? '' })} className="rounded p-2 hover:bg-gray-100"><Pencil size={16} /></button>
                  </div>
                ))}
              </section>
            )
          })}
        </div>)}
      {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl space-y-3 rounded-lg bg-white p-5"><h3 className="text-lg font-semibold">{form.id ? 'Edit event' : 'Add event'}</h3>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Title" />
        <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value as OperationalEventType })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows={3} placeholder="Notes" />
        <label className="text-sm"><input type="checkbox" className="mr-2" checked={form.blocks_discharge} onChange={(e) => setForm({ ...form, blocks_discharge: e.target.checked })} />Blocks discharge</label>
        <label className="text-sm"><input type="checkbox" className="mr-2" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />Hide from public</label>
        <div className="flex justify-end gap-2"><button onClick={() => setForm(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button onClick={() => void saveEvent()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">Save</button></div>
      </div></div>}
    </div>
  )
}
