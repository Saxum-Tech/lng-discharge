import type { Flight, CruiseSchedule, DischargeWindow, DayEvent } from './types'

/**
 * Merge flights and cruises into a flat list of DayEvents sorted by time.
 */
export function buildDayEvents(flights: Flight[], cruises: CruiseSchedule[]): DayEvent[] {
  const events: DayEvent[] = [
    ...flights.map(
      (f): DayEvent => ({
        id: f.id,
        type: 'flight',
        title: `✈ ${f.flight_number} — ${f.origin} → ${f.destination}`,
        time: f.scheduled_arrival,
        end_time: f.scheduled_departure ?? undefined,
        is_private: f.is_private,
        company_id: f.company_id,
      }),
    ),
    ...cruises.map(
      (c): DayEvent => ({
        id: c.id,
        type: 'cruise',
        title: `🚢 ${c.vessel_name}${c.vessel_type ? ` (${c.vessel_type})` : ''}`,
        time: c.arrival_date,
        end_time: c.departure_date ?? undefined,
        is_private: c.is_private,
        company_id: c.company_id,
      }),
    ),
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

  for (let i = 0; i < events.length - 1; i++) {
    const endOfPrev = new Date(events[i].end_time ?? events[i].time)
    const startOfNext = new Date(events[i + 1].time)
    const durationMs = startOfNext.getTime() - endOfPrev.getTime()
    const durationHours = durationMs / 3_600_000

    if (durationHours >= minHours) {
      windows.push({
        date: endOfPrev.toISOString().slice(0, 10),
        start_time: endOfPrev.toISOString(),
        end_time: startOfNext.toISOString(),
        duration_hours: Math.round(durationHours * 10) / 10,
      })
    }
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
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    days.push(date.toISOString().slice(0, 10))
    date.setDate(date.getDate() + 1)
  }
  return days
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
