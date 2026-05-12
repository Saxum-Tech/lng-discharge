'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { OperationalEvent, OperationalEventType } from '@/lib/types'
import { Plus, Trash2, Pencil, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const EVENT_TYPES: OperationalEventType[] = ['private_flight', 'ferry', 'port_constraint', 'other']

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

export default function EventsLogPage() {
  const { profile, user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [events, setEvents] = useState<OperationalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<EventFormState | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const [year, month] = currentMonth.split('-').map(Number)
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const end = new Date(Date.UTC(year, month, 1)).toISOString()

    const { data } = await supabase
      .from('operational_events')
      .select('*')
      .or(`and(start_time.gte.${start},start_time.lt.${end}),and(end_time.gte.${start},end_time.lt.${end})`)
      .order('start_time')

    setEvents((data ?? []) as OperationalEvent[])
    setSelectedIds(new Set())
    setLoading(false)
  }, [currentMonth])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const byDate = useMemo(() => {
    const map = new Map<string, OperationalEvent[]>()
    events.forEach((event) => {
      const day = event.start_time.slice(0, 10)
      const list = map.get(day) ?? []
      list.push(event)
      map.set(day, list)
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [events])

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
          <input type="month" value={currentMonth} onChange={(e) => setCurrentMonth(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <button onClick={() => setForm({ title: '', event_type: 'other', start_time: `${currentMonth}-01T08:00`, end_time: '', blocks_discharge: false, is_private: false, notes: '' })} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white"><Plus size={14} />Add</button>
        </div>
      </div>
      <button onClick={() => void deleteSelected()} className="mb-4 inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50" disabled={selectedIds.size===0}><Trash2 size={14} />Delete selected ({selectedIds.size})</button>
      {loading ? <p className="text-sm text-gray-500">Loading...</p> : (
      <div className="space-y-4">
        {byDate.map(([date, dayEvents]) => (
          <section key={date} className="rounded-lg border border-gray-200 bg-white">
            <header className="border-b border-gray-100 px-4 py-3 font-semibold">{format(parseISO(date), 'EEEE, d MMMM yyyy')}</header>
            {dayEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <input type="checkbox" checked={selectedIds.has(event.id)} onChange={(e)=>{ const n = new Set(selectedIds); e.target.checked ? n.add(event.id) : n.delete(event.id); setSelectedIds(n)}} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-gray-500">{event.event_type} · {format(parseISO(event.start_time), 'HH:mm')} {event.end_time ? `- ${format(parseISO(event.end_time), 'HH:mm')}` : ''} · {event.data_source}</p>
                </div>
                <button onClick={() => void toggleVisibility(event)} className="rounded p-2 hover:bg-gray-100">{event.is_private ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                <button onClick={() => setForm({ id: event.id, title: event.title, event_type: event.event_type, start_time: toLocalInputValue(event.start_time), end_time: event.end_time ? toLocalInputValue(event.end_time) : '', blocks_discharge: event.blocks_discharge, is_private: event.is_private, notes: event.notes ?? '' })} className="rounded p-2 hover:bg-gray-100"><Pencil size={16} /></button>
              </div>
            ))}
          </section>
        ))}
      </div>)}
      {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-xl rounded-lg bg-white p-5 space-y-3"><h3 className="text-lg font-semibold">{form.id ? 'Edit event' : 'Add event'}</h3>
      <input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Title" />
      <select value={form.event_type} onChange={(e)=>setForm({...form,event_type:e.target.value as OperationalEventType})} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">{EVENT_TYPES.map((t)=><option key={t} value={t}>{t}</option>)}</select>
      <input type="datetime-local" value={form.start_time} onChange={(e)=>setForm({...form,start_time:e.target.value})} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <input type="datetime-local" value={form.end_time} onChange={(e)=>setForm({...form,end_time:e.target.value})} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      <textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows={3} placeholder="Notes"/>
      <label className="text-sm"><input type="checkbox" className="mr-2" checked={form.blocks_discharge} onChange={(e)=>setForm({...form,blocks_discharge:e.target.checked})}/>Blocks discharge</label>
      <label className="text-sm"><input type="checkbox" className="mr-2" checked={form.is_private} onChange={(e)=>setForm({...form,is_private:e.target.checked})}/>Hide from public</label>
      <div className="flex justify-end gap-2"><button onClick={()=>setForm(null)} className="rounded-md border px-3 py-2 text-sm">Cancel</button><button onClick={()=>void saveEvent()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">Save</button></div>
      </div></div>}
    </div>
  )
}
