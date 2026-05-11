import type { Flight, CruiseSchedule, DischargeWindow, DayEvent } from './types'

/**
 * Merge flights and cruises into a flat list of DayEvents sorted by time.
 */
export function buildDayEvents(flights: Flight[], cruises: CruiseSchedule[]): DayEvent[] {
  const cruiseEvents: DayEvent[] = cruises.flatMap((c) => {
    const vesselLabel = `🚢 ${c.vessel_name}${c.vessel_type ? ` (${c.vessel_type})` : ''}`
    const arrivals: DayEvent[] = [
      {
        id: `${c.id}:arrival`,
        type: 'cruise',
        title: `${vesselLabel} — Arrival`,
        time: c.arrival_date,
        cruise_direction: 'arrival',
        is_private: c.is_private,
        company_id: c.company_id,
      },
    ]

    if (!c.departure_date) return arrivals

    return [
      ...arrivals,
      {
        id: `${c.id}:departure`,
        type: 'cruise',
        title: `${vesselLabel} — Departure`,
        time: c.departure_date,
        cruise_direction: 'departure',
        is_private: c.is_private,
        company_id: c.company_id,
      },
    ]
  })

  const events: DayEvent[] = [
    ...flights.map(
      (f): DayEvent => {
        const isDepartureFlight = f.origin === 'GIB'
        const primaryTime = isDepartureFlight ? (f.scheduled_departure ?? f.scheduled_arrival) : f.scheduled_arrival

        return {
          id: f.id,
          type: 'flight',
          title: `✈ ${f.flight_number} — ${isDepartureFlight ? 'Departure' : 'Arrival'}`,
          time: primaryTime,
          end_time: f.scheduled_departure ?? undefined,
          flight_direction: isDepartureFlight ? 'departure' : 'arrival',
          scheduled_arrival: f.scheduled_arrival,
          scheduled_departure: f.scheduled_departure ?? undefined,
          is_private: f.is_private,
          company_id: f.company_id,
          notes: f.notes,
          delay_minutes: (() => {
            const m = f.notes?.match(/DELAYED\s+(\d+)\s+min/i)
            return m ? Number.parseInt(m[1], 10) : null
          })(),
        }
      },
    ),
    ...cruiseEvents,
  ]

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  return events
}

/**
 * Given a sorted list of day events, compute all "discharge windows"
 * (gaps between consecutive events) within a calendar month.
 */
export function computeDischargeWindows(
  events: DayEvent[],
  _year: number,
  _month: number, // 1-based
  minHours = 4,
): DischargeWindow[] {
  if (events.length < 2) return []

  const windows: Omit<DischargeWindow, 'is_longest_of_month'>[] = []

  const isDeparture = (event: DayEvent): boolean =>
    event.flight_direction === 'departure' || event.cruise_direction === 'departure'

  const isArrival = (event: DayEvent): boolean =>
    event.flight_direction === 'arrival' || event.cruise_direction === 'arrival'

  const isOvernightWindow = (start: Date, end: Date): boolean => {
    const startHour = start.getUTCHours() + start.getUTCMinutes() / 60
    const endHour = end.getUTCHours() + end.getUTCMinutes() / 60
    const crossesDayBoundary = start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10)

    return crossesDayBoundary || startHour >= 20 || endHour <= 8
  }

  let lastDepartureEvent: DayEvent | null = null

  for (const event of events) {
    if (isDeparture(event)) {
      lastDepartureEvent = event
      continue
    }

    if (!isArrival(event) || !lastDepartureEvent) continue

    const endOfPrev = new Date(lastDepartureEvent.end_time ?? lastDepartureEvent.time)
    const startOfNext = new Date(event.time)
    const durationMs = startOfNext.getTime() - endOfPrev.getTime()
    const durationHours = durationMs / 3_600_000

    if (durationHours >= minHours && isOvernightWindow(endOfPrev, startOfNext)) {
      windows.push({
        date: endOfPrev.toISOString().slice(0, 10),
        start_time: endOfPrev.toISOString(),
        end_time: startOfNext.toISOString(),
        duration_hours: Math.round(durationHours * 10) / 10,
      })
    }

    lastDepartureEvent = null
  }

  const maxDuration = Math.max(...windows.map((w) => w.duration_hours), 0)

  return windows.map((w) => ({
    ...w,
    is_longest_of_month: w.duration_hours === maxDuration,
  }))
}

/**
 * Format a duration in hours to a human-readable string, e.g. "6h 30m".
 */
export function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/**
 * Return all days in a given month as YYYY-MM-DD strings.
 */
export function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const date = new Date(Date.UTC(year, month - 1, 1))
  while (date.getUTCMonth() === month - 1) {
    days.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days
}

/**
 * Return dates in month that do not contain any flight arrival/departure records.
 */
export function getMissingFlightDates(flights: Flight[], year: number, month: number): string[] {
  const days = getDaysInMonth(year, month)
  const flightDates = new Set<string>()

  flights.forEach((flight) => {
    flightDates.add(flight.scheduled_arrival.slice(0, 10))
    if (flight.scheduled_departure) {
      flightDates.add(flight.scheduled_departure.slice(0, 10))
    }
  })

  return days.filter((day) => !flightDates.has(day))
}

/**
 * Escape a value for CSV output.
 */
function csvEscape(value: unknown): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert an array of objects to a CSV string.
 */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ]
  return lines.join('\n')
}

/**
 * Trigger a browser download of a CSV file.
 */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
