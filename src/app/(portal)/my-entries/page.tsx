'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Flight, CruiseSchedule } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { format, parseISO } from 'date-fns'
import { Plus, Trash2, Pencil, Plane, Ship, X } from 'lucide-react'

type EntryType = 'flight' | 'cruise'

export default function MyEntriesPage() {
  const { profile } = useAuth()
  const [flights, setFlights] = useState<Flight[]>([])
  const [cruises, setCruises] = useState<CruiseSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Flight | CruiseSchedule | null>(null)
  const [entryType, setEntryType] = useState<EntryType>('flight')

  const companyId = profile?.company_id

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: f }, { data: c }] = await Promise.all([
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
    ])
    setFlights(f ?? [])
    setCruises(c ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function deleteFlight(id: string) {
    if (!confirm('Delete this flight?')) return
    await supabase.from('flights').delete().eq('id', id)
    fetchData()
  }

  async function deleteCruise(id: string) {
    if (!confirm('Delete this vessel entry?')) return
    await supabase.from('cruise_schedules').delete().eq('id', id)
    fetchData()
  }

  function openAdd(type: EntryType) {
    setEntryType(type)
    setEditItem(null)
    setShowModal(true)
  }

  function openEdit(item: Flight | CruiseSchedule, type: EntryType) {
    setEntryType(type)
    setEditItem(item)
    setShowModal(true)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">My Entries</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openAdd('flight')}>
            <Plus size={14} /> Add Flight
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openAdd('cruise')}>
            <Plus size={14} /> Add Vessel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Flights */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Plane size={16} /> Flights ({flights.length})
                </span>
              </CardTitle>
            </CardHeader>
            {flights.length === 0 ? (
              <p className="text-sm text-gray-400">No flights added yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {flights.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {f.flight_number} — {f.origin} → {f.destination}
                      </p>
                      <p className="text-xs text-gray-400">
                        Arrival: {format(parseISO(f.scheduled_arrival), 'dd MMM yyyy HH:mm')}
                        {f.is_private && (
                          <span className="ml-2 rounded bg-gray-100 px-1 py-0.5 text-gray-500">
                            Private
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(f, 'flight')}
                        className="rounded p-1 text-gray-400 hover:text-[var(--color-primary)]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteFlight(f.id)}
                        className="rounded p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Vessels */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Ship size={16} /> Vessels ({cruises.length})
                </span>
              </CardTitle>
            </CardHeader>
            {cruises.length === 0 ? (
              <p className="text-sm text-gray-400">No vessels added yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {cruises.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {c.vessel_name}
                        {c.vessel_type ? ` (${c.vessel_type})` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        Arrival: {format(parseISO(c.arrival_date), 'dd MMM yyyy HH:mm')}
                        {c.is_private && (
                          <span className="ml-2 rounded bg-gray-100 px-1 py-0.5 text-gray-500">
                            Private
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(c, 'cruise')}
                        className="rounded p-1 text-gray-400 hover:text-[var(--color-primary)]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteCruise(c.id)}
                        className="rounded p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <EntryModal
          type={entryType}
          editItem={editItem}
          companyId={companyId!}
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

// ─── Entry modal ────────────────────────────────────────────────────────────

function EntryModal({
  type,
  editItem,
  companyId,
  onClose,
  onSaved,
}: {
  type: EntryType
  editItem: Flight | CruiseSchedule | null
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Flight fields
  const [flightNumber, setFlightNumber] = useState((editItem as Flight)?.flight_number ?? '')
  const [origin, setOrigin] = useState((editItem as Flight)?.origin ?? '')
  const [destination, setDestination] = useState((editItem as Flight)?.destination ?? '')
  const [arrival, setArrival] = useState(
    (editItem as Flight)?.scheduled_arrival?.slice(0, 16) ?? '',
  )
  const [departure, setDeparture] = useState(
    (editItem as Flight)?.scheduled_departure?.slice(0, 16) ?? '',
  )

  // Cruise fields
  const [vesselName, setVesselName] = useState(
    (editItem as CruiseSchedule)?.vessel_name ?? '',
  )
  const [vesselType, setVesselType] = useState(
    (editItem as CruiseSchedule)?.vessel_type ?? '',
  )
  const [cruiseArrival, setCruiseArrival] = useState(
    (editItem as CruiseSchedule)?.arrival_date?.slice(0, 16) ?? '',
  )
  const [cruiseDeparture, setCruiseDeparture] = useState(
    (editItem as CruiseSchedule)?.departure_date?.slice(0, 16) ?? '',
  )

  const [isPrivate, setIsPrivate] = useState(editItem?.is_private ?? false)
  const [notes, setNotes] = useState(editItem?.notes ?? '')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (type === 'flight') {
        const payload = {
          company_id: companyId,
          flight_number: flightNumber,
          origin,
          destination,
          scheduled_arrival: new Date(arrival).toISOString(),
          scheduled_departure: departure ? new Date(departure).toISOString() : null,
          is_private: isPrivate,
          notes: notes || null,
          created_by: user!.id,
        }
        if (editItem) {
          const { error } = await supabase.from('flights').update(payload).eq('id', editItem.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('flights').insert(payload)
          if (error) throw error
        }
      } else {
        const payload = {
          company_id: companyId,
          vessel_name: vesselName,
          vessel_type: vesselType || null,
          arrival_date: new Date(cruiseArrival).toISOString(),
          departure_date: cruiseDeparture ? new Date(cruiseDeparture).toISOString() : null,
          is_private: isPrivate,
          notes: notes || null,
          created_by: user!.id,
        }
        if (editItem) {
          const { error } = await supabase
            .from('cruise_schedules')
            .update(payload)
            .eq('id', editItem.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('cruise_schedules').insert(payload)
          if (error) throw error
        }
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
            {editItem ? 'Edit' : 'Add'} {type === 'flight' ? 'Flight' : 'Vessel'}
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
              <Input
                label="Flight number"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Origin"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  required
                />
                <Input
                  label="Destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                />
              </div>
              <Input
                label="Arrival"
                type="datetime-local"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                required
              />
              <Input
                label="Departure (optional)"
                type="datetime-local"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
            </>
          ) : (
            <>
              <Input
                label="Vessel name"
                value={vesselName}
                onChange={(e) => setVesselName(e.target.value)}
                required
              />
              <Input
                label="Vessel type (optional)"
                value={vesselType}
                onChange={(e) => setVesselType(e.target.value)}
              />
              <Input
                label="Arrival"
                type="datetime-local"
                value={cruiseArrival}
                onChange={(e) => setCruiseArrival(e.target.value)}
                required
              />
              <Input
                label="Departure (optional)"
                type="datetime-local"
                value={cruiseDeparture}
                onChange={(e) => setCruiseDeparture(e.target.value)}
              />
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
