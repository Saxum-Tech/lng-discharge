'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  Flight,
  CruiseSchedule,
  FerrySchedule,
  OperationalEvent,
  OperationalEventType,
} from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { format, parseISO } from 'date-fns'
import {
  Plus,
  Trash2,
  Pencil,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Ship,
  ShipWheel,
  X,
  FerrisWheel,
  ClipboardList,
} from 'lucide-react'
import { formatAuditDateTime } from '@/lib/utils'

type EntryType = 'flight' | 'cruise' | 'ferry' | 'operational'

type UserLabelMap = Record<string, string>

const EVENT_TYPE_OPTIONS: OperationalEventType[] = ['private_flight', 'ferry', 'port_constraint', 'other']

function displayActorName(userId: string | null | undefined, labelMap: UserLabelMap, currentUserId: string | null) {
  if (!userId) return 'Unknown user'
  if (userId === currentUserId) return 'You'
  return labelMap[userId] ?? (userId ? `User ${userId.slice(0, 8)}` : 'Unknown user')
}

export default function MyEntriesPage() {
  const { profile, user } = useAuth()
  const [flights, setFlights] = useState<Flight[]>([])
  const [cruises, setCruises] = useState<CruiseSchedule[]>([])
  const [ferries, setFerries] = useState<FerrySchedule[]>([])
  const [operationalEvents, setOperationalEvents] = useState<OperationalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Flight | CruiseSchedule | FerrySchedule | OperationalEvent | null>(null)
  const [entryType, setEntryType] = useState<EntryType>('flight')
  const [userLabels, setUserLabels] = useState<UserLabelMap>({})

  const companyId = profile?.company_id

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: f }, { data: c }, { data: ferriesData }, { data: opData }] = await Promise.all([
      supabase
        .from('flights')
        .select('*')
        .eq('company_id', companyId)
        .order('scheduled_arrival', { ascending: false }),
      supabase
        .from('cruise_schedules')
        .select('*')
        .eq('company_id', companyId)
        .order('arrival_date', { ascending: false }),
      supabase
        .from('ferries')
        .select('*')
        .eq('company_id', companyId)
        .order('arrival_time', { ascending: false }),
      supabase
        .from('operational_events')
        .select('*')
        .eq('company_id', companyId)
        .order('start_time', { ascending: false }),
    ])

    const flightsRows = f ?? []
    const cruisesRows = c ?? []
    const ferryRows = ferriesData ?? []
    const opRows = opData ?? []

    setFlights(flightsRows)
    setCruises(cruisesRows)
    setFerries(ferryRows)
    setOperationalEvents(opRows)

    const actorIds = Array.from(
      new Set([
        ...flightsRows.map((row) => row.created_by),
        ...cruisesRows.map((row) => row.created_by),
        ...ferryRows.map((row) => row.created_by),
        ...opRows.map((row) => row.created_by),
      ].filter(Boolean)),
    )

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', actorIds)
      const mapping: UserLabelMap = {}
      ;(profiles ?? []).forEach((p) => {
        if (p.user_id) mapping[p.user_id] = p.full_name ?? p.user_id.slice(0, 8)
      })
      setUserLabels(mapping)
    }

    setLoading(false)
  }, [companyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function deleteEntry(type: EntryType, id: string) {
    if (!confirm('Delete this entry?')) return

    const table =
      type === 'flight'
        ? 'flights'
        : type === 'cruise'
          ? 'cruise_schedules'
          : type === 'ferry'
            ? 'ferries'
            : 'operational_events'

    await supabase.from(table).delete().eq('id', id)
    fetchData()
  }

  function openAdd(type: EntryType) {
    setEntryType(type)
    setEditItem(null)
    setShowModal(true)
  }

  function openEdit(item: Flight | CruiseSchedule | FerrySchedule | OperationalEvent, type: EntryType) {
    setEntryType(type)
    setEditItem(item)
    setShowModal(true)
  }

  const counts = useMemo(
    () => ({
      flights: flights.length,
      cruises: cruises.length,
      ferries: ferries.length,
      operational: operationalEvents.length,
    }),
    [flights.length, cruises.length, ferries.length, operationalEvents.length],
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">My Entries</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => openAdd('flight')}>
            <Plus size={14} /> Add Flight
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openAdd('cruise')}>
            <Plus size={14} /> Add Vessel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openAdd('ferry')}>
            <Plus size={14} /> Add Ferry
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openAdd('operational')}>
            <Plus size={14} /> Add Operational Event
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-6">
          <EntryList
            title={`Flights (${counts.flights})`}
            icon={<Plane size={16} />}
            rows={flights.map((f) => ({
              id: f.id,
              heading: `${f.flight_number} — ${f.origin} → ${f.destination}`,
              schedule: f.origin === 'GIB'
                ? `Departure: ${format(parseISO(f.scheduled_departure ?? f.scheduled_arrival), 'dd MMM yyyy HH:mm')}`
                : `Arrival: ${format(parseISO(f.scheduled_arrival), 'dd MMM yyyy HH:mm')}`,
              createdBy: f.created_by,
              createdAt: f.created_at,
              updatedAt: f.updated_at,
              type: 'flight' as EntryType,
            }))}
            onEdit={(id) => {
              const item = flights.find((f) => f.id === id)
              if (item) openEdit(item, 'flight')
            }}
            onDelete={(id) => deleteEntry('flight', id)}
            userLabels={userLabels}
            currentUserId={user?.id ?? null}
          />

          <EntryList
            title={`Vessels (${counts.cruises})`}
            icon={<Ship size={16} />}
            rows={cruises.map((c) => ({
              id: c.id,
              heading: `${c.vessel_name}${c.vessel_type ? ` (${c.vessel_type})` : ''}`,
              schedule: c.departure_date
                ? `Departure: ${format(parseISO(c.departure_date), 'dd MMM yyyy HH:mm')}`
                : `Arrival: ${format(parseISO(c.arrival_date), 'dd MMM yyyy HH:mm')}`,
              createdBy: c.created_by,
              createdAt: c.created_at,
              updatedAt: c.updated_at,
              type: 'cruise' as EntryType,
            }))}
            onEdit={(id) => {
              const item = cruises.find((c) => c.id === id)
              if (item) openEdit(item, 'cruise')
            }}
            onDelete={(id) => deleteEntry('cruise', id)}
            userLabels={userLabels}
            currentUserId={user?.id ?? null}
          />

          <EntryList
            title={`Ferries (${counts.ferries})`}
            icon={<FerrisWheel size={16} />}
            rows={ferries.map((f) => ({
              id: f.id,
              heading: `${f.ferry_name}${f.service_route ? ` (${f.service_route})` : ''}`,
              schedule: f.departure_time
                ? `Arrival ${format(parseISO(f.arrival_time), 'dd MMM HH:mm')} / Departure ${format(parseISO(f.departure_time), 'dd MMM HH:mm')}`
                : `Arrival ${format(parseISO(f.arrival_time), 'dd MMM HH:mm')}`,
              createdBy: f.created_by,
              createdAt: f.created_at,
              updatedAt: f.updated_at,
              type: 'ferry' as EntryType,
            }))}
            onEdit={(id) => {
              const item = ferries.find((f) => f.id === id)
              if (item) openEdit(item, 'ferry')
            }}
            onDelete={(id) => deleteEntry('ferry', id)}
            userLabels={userLabels}
            currentUserId={user?.id ?? null}
          />

          <EntryList
            title={`Operational events (${counts.operational})`}
            icon={<ClipboardList size={16} />}
            rows={operationalEvents.map((evt) => ({
              id: evt.id,
              heading: `${evt.title} (${evt.event_type.replaceAll('_', ' ')})`,
              schedule: evt.end_time
                ? `${format(parseISO(evt.start_time), 'dd MMM HH:mm')} → ${format(parseISO(evt.end_time), 'dd MMM HH:mm')}`
                : `${format(parseISO(evt.start_time), 'dd MMM yyyy HH:mm')}`,
              createdBy: evt.created_by,
              createdAt: evt.created_at,
              updatedAt: evt.updated_at,
              type: 'operational' as EntryType,
            }))}
            onEdit={(id) => {
              const item = operationalEvents.find((evt) => evt.id === id)
              if (item) openEdit(item, 'operational')
            }}
            onDelete={(id) => deleteEntry('operational', id)}
            userLabels={userLabels}
            currentUserId={user?.id ?? null}
          />
        </div>
      )}

      {showModal && (
        <EntryModal
          type={entryType}
          editItem={editItem}
          companyId={companyId!}
          userId={user?.id ?? null}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function EntryList({
  title,
  icon,
  rows,
  onEdit,
  onDelete,
  userLabels,
  currentUserId,
}: {
  title: string
  icon: React.ReactNode
  rows: Array<{
    id: string
    heading: string
    schedule: string
    createdBy: string
    createdAt: string
    updatedAt: string
    type: EntryType
  }>
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  userLabels: UserLabelMap
  currentUserId: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            {icon} {title}
          </span>
        </CardTitle>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No entries yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">{row.heading}</p>
                <p className="text-xs text-gray-500">{row.schedule}</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  Added by {displayActorName(row.createdBy, userLabels, currentUserId)} on {formatAuditDateTime(row.createdAt)} · Last update {formatAuditDateTime(row.updatedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(row.id)}
                  className="rounded p-1 text-gray-400 hover:text-[var(--color-primary)]"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(row.id)}
                  className="rounded p-1 text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function EntryModal({
  type,
  editItem,
  companyId,
  userId,
  onClose,
  onSaved,
}: {
  type: EntryType
  editItem: Flight | CruiseSchedule | FerrySchedule | OperationalEvent | null
  companyId: string
  userId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [flightNumber, setFlightNumber] = useState((editItem as Flight)?.flight_number ?? '')
  const [origin, setOrigin] = useState((editItem as Flight)?.origin ?? '')
  const [destination, setDestination] = useState((editItem as Flight)?.destination ?? '')
  const [arrival, setArrival] = useState((editItem as Flight)?.scheduled_arrival?.slice(0, 16) ?? '')
  const [departure, setDeparture] = useState((editItem as Flight)?.scheduled_departure?.slice(0, 16) ?? '')

  const [vesselName, setVesselName] = useState((editItem as CruiseSchedule)?.vessel_name ?? '')
  const [vesselType, setVesselType] = useState((editItem as CruiseSchedule)?.vessel_type ?? '')
  const [cruiseArrival, setCruiseArrival] = useState((editItem as CruiseSchedule)?.arrival_date?.slice(0, 16) ?? '')
  const [cruiseDeparture, setCruiseDeparture] = useState((editItem as CruiseSchedule)?.departure_date?.slice(0, 16) ?? '')

  const [ferryName, setFerryName] = useState((editItem as FerrySchedule)?.ferry_name ?? '')
  const [ferryRoute, setFerryRoute] = useState((editItem as FerrySchedule)?.service_route ?? '')
  const [ferryArrival, setFerryArrival] = useState((editItem as FerrySchedule)?.arrival_time?.slice(0, 16) ?? '')
  const [ferryDeparture, setFerryDeparture] = useState((editItem as FerrySchedule)?.departure_time?.slice(0, 16) ?? '')

  const [eventType, setEventType] = useState((editItem as OperationalEvent)?.event_type ?? 'other')
  const [eventTitle, setEventTitle] = useState((editItem as OperationalEvent)?.title ?? '')
  const [eventStart, setEventStart] = useState((editItem as OperationalEvent)?.start_time?.slice(0, 16) ?? '')
  const [eventEnd, setEventEnd] = useState((editItem as OperationalEvent)?.end_time?.slice(0, 16) ?? '')
  const [blocksDischarge, setBlocksDischarge] = useState((editItem as OperationalEvent)?.blocks_discharge ?? true)

  const [isPrivate, setIsPrivate] = useState(editItem?.is_private ?? false)
  const [notes, setNotes] = useState(editItem?.notes ?? '')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) {
      setError('No authenticated user session found.')
      return
    }

    setError('')
    setSaving(true)

    try {
      if (type === 'flight') {
        const payload = {
          company_id: companyId,
          flight_number: flightNumber,
          origin,
          destination,
          scheduled_arrival: `${arrival}:00Z`,
          scheduled_departure: departure ? `${departure}:00Z` : null,
          is_private: isPrivate,
          notes: notes || null,
        }

        const { error } = editItem
          ? await supabase.from('flights').update(payload).eq('id', editItem.id)
          : await supabase.from('flights').insert({ ...payload, created_by: userId })

        if (error) throw error
      } else if (type === 'cruise') {
        const payload = {
          company_id: companyId,
          vessel_name: vesselName,
          vessel_type: vesselType || null,
          arrival_date: `${cruiseArrival}:00Z`,
          departure_date: cruiseDeparture ? `${cruiseDeparture}:00Z` : null,
          is_private: isPrivate,
          notes: notes || null,
        }

        const { error } = editItem
          ? await supabase.from('cruise_schedules').update(payload).eq('id', editItem.id)
          : await supabase.from('cruise_schedules').insert({ ...payload, created_by: userId })

        if (error) throw error
      } else if (type === 'ferry') {
        const payload = {
          company_id: companyId,
          ferry_name: ferryName,
          service_route: ferryRoute || null,
          arrival_time: `${ferryArrival}:00Z`,
          departure_time: ferryDeparture ? `${ferryDeparture}:00Z` : null,
          is_private: isPrivate,
          notes: notes || null,
        }

        const { error } = editItem
          ? await supabase.from('ferries').update(payload).eq('id', editItem.id)
          : await supabase.from('ferries').insert({ ...payload, created_by: userId })

        if (error) throw error
      } else {
        const payload = {
          company_id: companyId,
          event_type: eventType,
          title: eventTitle,
          start_time: `${eventStart}:00Z`,
          end_time: eventEnd ? `${eventEnd}:00Z` : null,
          blocks_discharge: blocksDischarge,
          is_private: isPrivate,
          notes: notes || null,
        }

        const { error } = editItem
          ? await supabase.from('operational_events').update(payload).eq('id', editItem.id)
          : await supabase.from('operational_events').insert({ ...payload, created_by: userId })

        if (error) throw error
      }

      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editItem ? 'Edit' : 'Add'} {type === 'flight' ? 'Flight' : type === 'cruise' ? 'Vessel' : type === 'ferry' ? 'Ferry' : 'Operational event'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {error && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleSave} className="space-y-3">
          {type === 'flight' ? (
            <>
              <Input label="Flight number" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Origin" value={origin} onChange={(e) => setOrigin(e.target.value)} required />
                <Input label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} required />
              </div>
              <Input label="Arrival" type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} required />
              <Input label="Departure (optional)" type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} />
            </>
          ) : type === 'cruise' ? (
            <>
              <Input label="Vessel name" value={vesselName} onChange={(e) => setVesselName(e.target.value)} required />
              <Input label="Vessel type (optional)" value={vesselType} onChange={(e) => setVesselType(e.target.value)} />
              <Input label="Arrival" type="datetime-local" value={cruiseArrival} onChange={(e) => setCruiseArrival(e.target.value)} required />
              <Input label="Departure (optional)" type="datetime-local" value={cruiseDeparture} onChange={(e) => setCruiseDeparture(e.target.value)} />
            </>
          ) : type === 'ferry' ? (
            <>
              <Input label="Ferry name" value={ferryName} onChange={(e) => setFerryName(e.target.value)} required />
              <Input label="Route (optional)" value={ferryRoute} onChange={(e) => setFerryRoute(e.target.value)} />
              <Input label="Arrival" type="datetime-local" value={ferryArrival} onChange={(e) => setFerryArrival(e.target.value)} required />
              <Input label="Departure (optional)" type="datetime-local" value={ferryDeparture} onChange={(e) => setFerryDeparture(e.target.value)} />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Event type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as OperationalEventType)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <Input label="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required />
              <Input label="Start" type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} required />
              <Input label="End (optional)" type="datetime-local" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
              <div className="flex items-center gap-2">
                <input
                  id="blocks-discharge"
                  type="checkbox"
                  checked={blocksDischarge}
                  onChange={(e) => setBlocksDischarge(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
                />
                <label htmlFor="blocks-discharge" className="text-sm text-gray-700">
                  Blocks discharge planning
                </label>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <input
              id="is-private"
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-[var(--color-primary)]"
            />
            <label htmlFor="is-private" className="text-sm text-gray-700">
              Private (only visible to your company)
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
