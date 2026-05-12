import type {
  Flight,
  CruiseSchedule,
  FerrySchedule,
  OperationalEvent,
  DischargeWindow,
  DayEvent,
  DaySuitability,
} from './types'
import type { MaritimeDailyForecast } from './open-meteo'
import { getWeatherSafetyStatus } from './open-meteo'

const IDEAL_EARLY_BERTHING_HOUR = 21
const LATEST_EARLY_BERTHING_HOUR = 22
const STANDARD_BERTHING_HOUR = 23

/**
 * Merge flights, cruises, ferries and operational events into a flat list of DayEvents sorted by time.
 */
export function buildUnifiedDayEvents(
  flights: Flight[],
  cruises: CruiseSchedule[],
  ferries: FerrySchedule[] = [],
  operationalEvents: OperationalEvent[] = [],
): DayEvent[] {
  const cruiseEvents: DayEvent[] = cruises.flatMap((c) => {
    const vesselLabel = `${c.vessel_name}${c.vessel_type ? ` (${c.vessel_type})` : ''}`
    const arrivals: DayEvent[] = [
      {
        id: `${c.id}:arrival`,
        type: 'cruise',
        title: `${vesselLabel} — Arrival`,
        time: c.arrival_date,
        cruise_direction: 'arrival',
        is_private: c.is_private,
        company_id: c.company_id,
        data_source: c.data_source,
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
        data_source: c.data_source,
      },
    ]
  })

  const ferryEvents: DayEvent[] = ferries.flatMap((f) => {
    const arrivals: DayEvent[] = [
      {
        id: `${f.id}:arrival`,
        type: 'ferry',
        title: `${f.ferry_name} — Arrival`,
        time: f.arrival_time,
        is_private: f.is_private,
        company_id: f.company_id,
        notes: f.notes,
        data_source: f.data_source,
        blocks_discharge: true,
      },
    ]

    if (!f.departure_time) return arrivals

    return [
      ...arrivals,
      {
        id: `${f.id}:departure`,
        type: 'ferry',
        title: `${f.ferry_name} — Departure`,
        time: f.departure_time,
        is_private: f.is_private,
        company_id: f.company_id,
        notes: f.notes,
        data_source: f.data_source,
        blocks_discharge: true,
      },
    ]
  })

  const manualEvents: DayEvent[] = operationalEvents.map((event) => ({
    id: event.id,
    type: 'operational',
    title: `${event.title}`,
    time: event.start_time,
    end_time: event.end_time ?? undefined,
    is_private: event.is_private,
    company_id: event.company_id,
    notes: event.notes,
    data_source: event.data_source,
    blocks_discharge: event.blocks_discharge,
  }))

  const events: DayEvent[] = [
    ...flights.map(
      (f): DayEvent => {
        const isDepartureFlight = f.origin === 'GIB'
        const primaryTime = isDepartureFlight
          ? (f.scheduled_departure ?? f.scheduled_arrival)
          : f.scheduled_arrival

        return {
          id: f.id,
          type: 'flight',
          title: `${f.flight_number} — ${isDepartureFlight ? 'Departure' : 'Arrival'}`,
          time: primaryTime,
          end_time: f.scheduled_departure ?? undefined,
          flight_direction: isDepartureFlight ? 'departure' : 'arrival',
          scheduled_arrival: f.scheduled_arrival,
          scheduled_departure: f.scheduled_departure ?? undefined,
          is_private: f.is_private,
          company_id: f.company_id,
          notes: f.notes,
          data_source: f.data_source,
          blocks_discharge: true,
          delay_minutes: (() => {
            const m = f.notes?.match(/DELAYED\s+(\d+)\s+min/i)
            return m ? Number.parseInt(m[1], 10) : null
          })(),
        }
      },
    ),
    ...cruiseEvents,
    ...ferryEvents,
    ...manualEvents,
  ]

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  return events
}

/**
 * Backwards-compatible alias used by existing pages.
 */
export function buildDayEvents(
  flights: Flight[],
  cruises: CruiseSchedule[],
  ferries: FerrySchedule[] = [],
  operationalEvents: OperationalEvent[] = [],
): DayEvent[] {
  return buildUnifiedDayEvents(flights, cruises, ferries, operationalEvents)
}

/**
 * Given a sorted list of day events, compute all "discharge windows"
 * (gaps between consecutive events) within a calendar month.
 */
export function computeDischargeWindows(
  events: DayEvent[],
  _year: number,
  _month: number,
  minHours = 4,
): DischargeWindow[] {
  if (events.length < 2) return []

  const windows: Omit<DischargeWindow, 'is_longest_of_month'>[] = []

  const isDeparture = (event: DayEvent): boolean =>
    event.flight_direction === 'departure' ||
    event.cruise_direction === 'departure' ||
    (event.type === 'ferry' && event.id.endsWith(':departure'))

  const isArrival = (event: DayEvent): boolean =>
    event.flight_direction === 'arrival' ||
    event.cruise_direction === 'arrival' ||
    (event.type === 'ferry' && event.id.endsWith(':arrival'))

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

function getIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function makeBerthingTargetTime(dateKey: string, hour: number): Date {
  // Decision scoring is normalized to UTC timestamps and converted for display in UI.
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:00:00.000Z`)
}

function eventBlocksTarget(event: DayEvent, target: Date): boolean {
  if (event.blocks_discharge === false) return false

  const eventStart = new Date(event.time)
  const eventEnd = event.end_time ? new Date(event.end_time) : eventStart

  if (eventStart >= target) return true
  if (eventStart < target && eventEnd > target) return true

  return false
}

/**
 * Compute day-level suitability according to LNG berthing rules and weather thresholds.
 */
export function computeDailySuitability(
  events: DayEvent[],
  year: number,
  month: number,
  weatherByDate: Map<string, MaritimeDailyForecast>,
  missingFlightDates: string[] = [],
): DaySuitability[] {
  const dates = getDaysInMonth(year, month)
  const missingDateSet = new Set(missingFlightDates)

  return dates.map((date) => {
    const idealEarlyTarget = makeBerthingTargetTime(date, IDEAL_EARLY_BERTHING_HOUR)
    const latestEarlyTarget = makeBerthingTargetTime(date, LATEST_EARLY_BERTHING_HOUR)
    const standardTarget = makeBerthingTargetTime(date, STANDARD_BERTHING_HOUR)

    const relevantEvents = events.filter((event) => {
      const start = new Date(event.time)
      const end = event.end_time ? new Date(event.end_time) : start
      const dayStart = new Date(`${date}T00:00:00.000Z`)
      const dayEnd = new Date(`${date}T23:59:59.999Z`)
      return end >= dayStart && start <= dayEnd
    })

    const idealEarlyBlockingEvents = relevantEvents.filter((event) => eventBlocksTarget(event, idealEarlyTarget))
    const latestEarlyBlockingEvents = relevantEvents.filter((event) => eventBlocksTarget(event, latestEarlyTarget))
    const standardBlockingEvents = relevantEvents.filter((event) => eventBlocksTarget(event, standardTarget))

    const weather = weatherByDate.get(date)
    const weatherSafety = weather
      ? getWeatherSafetyStatus(weather)
      : { isUnsafe: false, reasons: [] }
    const weatherBlocked = weatherSafety.isUnsafe

    const reasons: string[] = []
    if (missingDateSet.has(date)) reasons.push('Missing flight coverage')
    reasons.push(...weatherSafety.reasons)

    if (weatherBlocked) {
      return {
        date,
        color: 'red',
        recommended_berthing_time: null,
        has_early_berthing: false,
        is_weather_blocked: true,
        reasons: [...reasons, 'Weather safety block'],
      }
    }

    if (idealEarlyBlockingEvents.length === 0) {
      return {
        date,
        color: 'green',
        recommended_berthing_time: makeBerthingTargetTime(date, IDEAL_EARLY_BERTHING_HOUR).toISOString(),
        has_early_berthing: true,
        is_weather_blocked: false,
        reasons: reasons.length ? reasons : ['Early berthing possible by 21:00 (ideal 2-hour pre-berth lead)'],
      }
    }

    if (latestEarlyBlockingEvents.length === 0) {
      return {
        date,
        color: 'green',
        recommended_berthing_time: makeBerthingTargetTime(date, LATEST_EARLY_BERTHING_HOUR).toISOString(),
        has_early_berthing: true,
        is_weather_blocked: false,
        reasons: [...reasons, 'Berthing possible by 22:00 (1-hour pre-berth lead before 23:00 discharge)'],
      }
    }

    if (standardBlockingEvents.length === 0) {
      return {
        date,
        color: 'orange',
        recommended_berthing_time: makeBerthingTargetTime(date, STANDARD_BERTHING_HOUR).toISOString(),
        has_early_berthing: false,
        is_weather_blocked: false,
        reasons: [...reasons, 'Traffic clears by 23:00 only (no pre-berth preparation window)'],
      }
    }

    return {
      date,
      color: 'red',
      recommended_berthing_time: null,
      has_early_berthing: false,
      is_weather_blocked: false,
      reasons: [...reasons, 'No feasible berthing at/after 23:00'],
    }
  })
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
    days.push(getIsoDateString(date))
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
