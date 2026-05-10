import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_DESTINATION_AIRPORT,
  SETTINGS_ID,
  UNKNOWN_AIRPORT_CODE,
} from '@/lib/constants'

type SyncOwner = { companyId: string; userId: string }

type ParsedFlight = {
  flight_number: string
  origin: string
  destination: string
  scheduled_arrival: string
  scheduled_departure: string | null
  aircraft_type: string | null
  passenger_count: number | null
}

type ParsedCruise = {
  vessel_name: string
  vessel_type: string | null
  arrival_date: string
  departure_date: string | null
  passenger_count: number | null
}

type HtmlTableBlock = {
  rows: string[][]
  context: string
}

export type PublicDataSyncSummary = {
  flights_inserted: number
  flights_updated: number
  flights_skipped: number
  cruises_inserted: number
  cruises_updated: number
  cruises_skipped: number
  warnings: string[]
}

const MONTH_INDEX: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
}

function stripTags(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.searchParams.has('access_key')) {
      url.searchParams.set('access_key', '***')
    }
    if (url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', '***')
    }
    if (url.searchParams.has('key')) {
      url.searchParams.set('key', '***')
    }
    return url.toString()
  } catch {
    return value
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/(access_key=)[^&\s]+/gi, '$1***')
    .replace(/(api_key=)[^&\s]+/gi, '$1***')
    .replace(/([?&]key=)[^&\s]+/gi, '$1***')
}

function normalizeYear(yearRaw: string): string {
  if (yearRaw.length !== 2) return yearRaw

  const yy = Number.parseInt(yearRaw, 10)
  const currentYear = new Date().getUTCFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  let fullYear = currentCentury + yy
  if (fullYear - currentYear > 20) fullYear -= 100
  if (currentYear - fullYear > 80) fullYear += 100
  return String(fullYear)
}

function normalizeDate(value: string, contextDate?: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{1,6}$/.test(trimmed)) return null

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()

  const dayFirst = trimmed.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  )
  if (dayFirst) {
    const day = dayFirst[1].padStart(2, '0')
    const month = dayFirst[2].padStart(2, '0')
    const year = normalizeYear(dayFirst[3])
    const hour = (dayFirst[4] ?? '00').padStart(2, '0')
    const minute = dayFirst[5] ?? '00'
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  const monthName = trimmed.match(
    /^(?:[A-Za-z]{3,9}\s+)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?$/,
  )
  if (monthName) {
    const month = MONTH_INDEX[monthName[2].slice(0, 3).toLowerCase()]
    if (month) {
      const day = monthName[1].padStart(2, '0')
      const year = normalizeYear(monthName[3])
      const hour = (monthName[4] ?? '00').padStart(2, '0')
      const minute = monthName[5] ?? '00'
      const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
    }
  }

  const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (timeOnly && contextDate) {
    const hour = timeOnly[1].padStart(2, '0')
    const minute = timeOnly[2]
    const parsed = new Date(`${contextDate}T${hour}:${minute}:00Z`)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  return null
}

function extractRows(html: string): string[][] {
  const rows = [...html.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi)]
  return rows
    .map((row) => {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => stripTags(cell[1]))
        .filter(Boolean)
      return cells
    })
    .filter((cells) => cells.length > 0)
}

function extractTableBlocks(html: string): HtmlTableBlock[] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]
    .map((table) => {
      const tableHtml = table[0]
      const start = table.index ?? 0
      return {
        rows: extractRows(tableHtml),
        context: stripTags(html.slice(Math.max(0, start - 1500), start)),
      }
    })
    .filter((table) => table.rows.length > 0)
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

function looksLikeDateText(value: string): boolean {
  const trimmed = value.trim()
  return /[A-Za-z]{3,}/.test(trimmed) || /[\/.-]/.test(trimmed) || /^\d{1,2}:\d{2}$/.test(trimmed)
}

function extractContextDate(value: string): string | null {
  const cleaned = stripTags(value).replace(/\s+/g, ' ').trim()
  const candidates = [
    ...cleaned.matchAll(
      /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b/gi,
    ),
    ...cleaned.matchAll(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b/gi),
    ...cleaned.matchAll(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g),
  ]

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const normalized = normalizeDate(candidates[i][0])
    if (normalized) return normalized.slice(0, 10)
  }

  return null
}

function parsePassengerCountCell(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, '')
  return /^\d{1,6}$/.test(cleaned) ? Number.parseInt(cleaned, 10) : null
}

function findTrailingPassengerCount(row: string[]): number | null {
  for (let i = row.length - 1; i >= 0; i -= 1) {
    const count = parsePassengerCountCell(row[i])
    if (count !== null) return count
  }

  return null
}

function findDateInRow(row: string[], contextDate?: string, exclude?: string): string | null {
  for (const cell of row) {
    if (exclude && cell === exclude) continue
    if (!looksLikeDateText(cell)) continue

    const normalized = normalizeDate(cell, contextDate)
    if (normalized) return normalized
  }

  return null
}

function extractVesselType(row: string[], vesselName: string): string | null {
  const vesselLower = vesselName.trim().toLowerCase()
  return (
    row.find((c) => {
      const candidate = c.trim()
      if (!candidate) return false
      const candidateLower = candidate.toLowerCase()
      if (candidateLower === vesselLower) return false
      if (vesselLower.includes(candidateLower) || candidateLower.includes(vesselLower)) {
        return false
      }
      return /(cruise|ferry|liner|vessel|ship)/i.test(candidate)
    }) ?? null
  )
}

function parseLegacyCruisesFromRows(rows: string[][]): ParsedCruise[] {
  const results: ParsedCruise[] = []

  for (const row of rows) {
    if (row.length < 2) continue

    const headers = row.map(normalizeHeader)
    if (headers.includes('arrival') || headers.includes('shipname') || headers.includes('vesselname')) {
      continue
    }

    const firstIsDate = normalizeDate(row[0])
    const secondIsDate = normalizeDate(row[1])
    const vessel = firstIsDate && !secondIsDate ? row[1] : row[0]
    const arrival = firstIsDate ?? secondIsDate
    if (!vessel || !arrival) continue
    const departure = row[2] ? normalizeDate(row[2]) : null
    const vesselType = extractVesselType(row, vessel)
    const passengerCount = findTrailingPassengerCount(row)

    results.push({
      vessel_name: vessel,
      vessel_type: vesselType,
      arrival_date: arrival,
      departure_date: departure,
      passenger_count: passengerCount,
    })
  }

  return results
}

function parseCruisesFromHtml(html: string): ParsedCruise[] {
  const tables = extractTableBlocks(html)
  const combinedResults: ParsedCruise[] = []

  for (const table of tables) {
    let vesselIndex = 0
    let arrivalIndex = 1
    let departureIndex = 2
    let passengerIndex: number | null = null
    const results: ParsedCruise[] = []

    for (const row of table.rows) {
      const headers = row.map(normalizeHeader)
      if (headers.includes('arrival') || headers.includes('shipname') || headers.includes('vesselname')) {
        arrivalIndex = headers.findIndex((header) => header === 'arrival' || header === 'eta')
        vesselIndex = headers.findIndex(
          (header) => header === 'shipname' || header === 'vesselname' || header === 'ship',
        )
        departureIndex = headers.findIndex(
          (header) => header === 'etd' || header === 'departure' || header === 'departuredate',
        )
        passengerIndex = headers.findIndex(
          (header) => header === 'pax' || header === 'passengers' || header === 'passengercount',
        )
        continue
      }

      const vessel = row[vesselIndex] ?? row[0]
      const arrivalCell = arrivalIndex >= 0 ? row[arrivalIndex] : undefined
      const arrival = arrivalCell ? normalizeDate(arrivalCell) : findDateInRow(row)
      if (!vessel || !arrival) continue

      const departureCell = departureIndex >= 0 ? row[departureIndex] : undefined
      const departure = departureCell
        ? normalizeDate(departureCell)
        : findDateInRow(row, undefined, arrivalCell)
      const passengerCount =
        passengerIndex !== null && passengerIndex >= 0
          ? parsePassengerCountCell(row[passengerIndex] ?? '')
          : findTrailingPassengerCount(row)

      results.push({
        vessel_name: vessel,
        vessel_type: extractVesselType(row, vessel),
        arrival_date: arrival,
        departure_date: departure,
        passenger_count: passengerCount,
      })
    }

    if (results.length > 0) {
      combinedResults.push(...results)
    }
  }

  return combinedResults.length > 0 ? combinedResults : parseLegacyCruisesFromRows(extractRows(html))
}

function looksLikeFlightNumber(value: string): boolean {
  return /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/.test(value.trim().toUpperCase())
}

function looksLikeTimeOnly(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value.trim())
}

function parseLegacyFlightsFromRows(rows: string[][]): ParsedFlight[] {
  const results: ParsedFlight[] = []

  for (const row of rows) {
    if (row.length < 4) continue
    const maybeFlight = row.find(looksLikeFlightNumber)
    if (!maybeFlight) continue

    const timeValue = row.map((cell) => normalizeDate(cell)).find((d) => d !== null)
    if (!timeValue) continue

    const cleaned = maybeFlight.toUpperCase().replace(/\s+/g, '')
    const origin =
      row.find((c) => /^[A-Z]{3}$/.test(c.trim().toUpperCase())) ?? UNKNOWN_AIRPORT_CODE
    const iataCodes = row.filter((c) => /^[A-Z]{3}$/.test(c.trim().toUpperCase()))
    const destinationGuess =
      row.find((c) => /gib|gibraltar/i.test(c)) ??
      iataCodes[1] ??
      DEFAULT_DESTINATION_AIRPORT

    results.push({
      flight_number: cleaned,
      origin,
      destination: destinationGuess,
      scheduled_arrival: timeValue,
      scheduled_departure: null,
      aircraft_type: null,
      passenger_count: null,
    })
  }

  return results
}

function parseFlightsFromHtml(html: string): ParsedFlight[] {
  const tables = extractTableBlocks(html)
  const combinedResults: ParsedFlight[] = []

  for (const table of tables) {
    const results: ParsedFlight[] = []
    let contextDate = extractContextDate(table.context)
    let direction: 'arrival' | 'departure' | null =
      /departure/i.test(table.context) && !/arrival/i.test(table.context)
        ? 'departure'
        : /arrival/i.test(table.context) && !/departure/i.test(table.context)
          ? 'arrival'
          : null
    let locationIndex = 0
    let flightIndex = 1
    let scheduleIndex = 2

    for (const row of table.rows) {
      const headers = row.map(normalizeHeader)
      if (headers.includes('flight') && headers.some((header) => header.includes('sched'))) {
        const detectedLocationIndex = headers.findIndex(
          (header) =>
            header === 'from' ||
            header === 'to' ||
            header === 'origin' ||
            header === 'destination',
        )
        const detectedFlightIndex = headers.findIndex((header) => header.includes('flight'))
        const detectedScheduleIndex = headers.findIndex(
          (header) => header.includes('sched') || header.includes('time'),
        )

        if (detectedLocationIndex >= 0) locationIndex = detectedLocationIndex
        if (detectedFlightIndex >= 0) flightIndex = detectedFlightIndex
        if (detectedScheduleIndex >= 0) scheduleIndex = detectedScheduleIndex
        if (headers.includes('to') || headers.includes('departure')) direction = 'departure'
        if (headers.includes('from') || headers.includes('arrival')) direction = 'arrival'
        continue
      }

      if (row.length === 1) {
        const maybeDate = extractContextDate(row[0])
        if (maybeDate) {
          contextDate = maybeDate
          continue
        }
        if (/departures?/i.test(row[0])) {
          direction = 'departure'
          continue
        }
        if (/arrivals?/i.test(row[0])) {
          direction = 'arrival'
          continue
        }
      }

      const flightCell = row[flightIndex] ?? row.find(looksLikeFlightNumber)
      if (!flightCell || !looksLikeFlightNumber(flightCell)) continue

      const timeCell =
        row[scheduleIndex] ??
        row.find((cell) => looksLikeTimeOnly(cell) || normalizeDate(cell, contextDate ?? undefined) !== null)
      const scheduled = timeCell ? normalizeDate(timeCell, contextDate ?? undefined) : null
      if (!scheduled) continue

      const locationCell =
        row[locationIndex] ??
        row.find(
          (cell) =>
            cell !== flightCell &&
            cell !== timeCell &&
            !looksLikeFlightNumber(cell) &&
            !looksLikeTimeOnly(cell) &&
            !/scheduled|estimated|landed|enroute|gate|status|on\s*time|delayed|cancelled/i.test(
              cell,
            ),
        )
      const location = locationCell?.trim() || UNKNOWN_AIRPORT_CODE
      const cleanedFlight = flightCell.toUpperCase().replace(/\s+/g, '')

      results.push({
        flight_number: cleanedFlight,
        origin: direction === 'departure' ? DEFAULT_DESTINATION_AIRPORT : location,
        destination: direction === 'departure' ? location : DEFAULT_DESTINATION_AIRPORT,
        scheduled_arrival: scheduled,
        scheduled_departure: direction === 'departure' ? scheduled : null,
        aircraft_type: null,
        passenger_count: null,
      })
    }

    if (results.length > 0) {
      combinedResults.push(...results)
    }
  }

  return combinedResults.length > 0 ? combinedResults : parseLegacyFlightsFromRows(extractRows(html))
}

function parseFlightsFromApi(json: unknown): ParsedFlight[] {
  if (!json || typeof json !== 'object') return []
  const data = (json as { data?: unknown[] }).data
  if (!Array.isArray(data)) return []

  const flights: ParsedFlight[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue

    const record = item as {
      flight?: { iata?: string; number?: string }
      departure?: { iata?: string; airport?: string; scheduled?: string }
      arrival?: { iata?: string; airport?: string; scheduled?: string }
      aircraft?: { iata?: string }
    }

    const flightNumber = record.flight?.iata || record.flight?.number
    const arrival = normalizeDate(record.arrival?.scheduled ?? '')
    if (!flightNumber || !arrival) continue

    flights.push({
      flight_number: flightNumber.toUpperCase().replace(/\s+/g, ''),
      origin: record.departure?.iata || record.departure?.airport || UNKNOWN_AIRPORT_CODE,
      destination:
        record.arrival?.iata || record.arrival?.airport || DEFAULT_DESTINATION_AIRPORT,
      scheduled_arrival: arrival,
      scheduled_departure: normalizeDate(record.departure?.scheduled ?? ''),
      aircraft_type: record.aircraft?.iata ?? null,
      passenger_count: null,
    })
  }

  return flights
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'lng-discharge-public-data-sync/1.0',
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${redactUrl(url)}`)
  }
  return response.text()
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'lng-discharge-public-data-sync/1.0',
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${redactUrl(url)}`)
  }
  return response.json()
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function buildAviationStackWindowUrls(apiKey: string): string[] {
  const urls: string[] = []
  const today = new Date()
  const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const endDate = new Date(startDate)
  endDate.setUTCMonth(endDate.getUTCMonth() + 2)

  for (let cursor = new Date(startDate); cursor < endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const flightDate = toIsoDate(cursor)
    for (const key of ['arr_iata', 'dep_iata']) {
      urls.push(
        `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(apiKey)}&${key}=${DEFAULT_DESTINATION_AIRPORT}&flight_date=${flightDate}`,
      )
    }
  }

  return urls
}

function parseAviationStackPagination(json: unknown): { total: number; count: number; offset: number } | null {
  if (!json || typeof json !== 'object') return null
  const pagination = (json as { pagination?: unknown }).pagination
  if (!pagination || typeof pagination !== 'object') return null

  const meta = pagination as { total?: unknown; count?: unknown; offset?: unknown }
  const total = typeof meta.total === 'number' ? meta.total : 0
  const count = typeof meta.count === 'number' ? meta.count : 0
  const offset = typeof meta.offset === 'number' ? meta.offset : 0
  return { total, count, offset }
}

async function fetchAllAviationStackFlightsForUrl(baseUrl: string): Promise<ParsedFlight[]> {
  const flights: ParsedFlight[] = []
  const limit = 100
  let offset = 0

  for (;;) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    const pageUrl = `${baseUrl}${separator}limit=${limit}&offset=${offset}`
    const apiData = await fetchJson(pageUrl)
    flights.push(...parseFlightsFromApi(apiData))

    const pagination = parseAviationStackPagination(apiData)
    if (!pagination || pagination.count <= 0) break
    offset += pagination.count
    if (offset >= pagination.total) break
  }

  return flights
}

async function resolveSyncOwner(admin: SupabaseClient): Promise<SyncOwner> {
  const { data: preferred, error: preferredError } = await admin
    .from('profiles')
    .select('user_id, company_id, role, is_active')
    .in('role', ['superadmin', 'company_admin'])
    .not('company_id', 'is', null)
    .eq('is_active', true)
    .limit(1)

  if (preferredError) throw preferredError
  const p = preferred?.[0]
  if (p?.company_id && p.user_id) {
    return { companyId: p.company_id, userId: p.user_id }
  }

  const { data: fallback, error: fallbackError } = await admin
    .from('profiles')
    .select('user_id, company_id, is_active')
    .not('company_id', 'is', null)
    .eq('is_active', true)
    .limit(1)
  if (fallbackError) throw fallbackError

  const f = fallback?.[0]
  if (!f?.company_id || !f.user_id) {
    throw new Error(
      'No active profile with company_id found. Assign at least one active user to a company before syncing.',
    )
  }

  return { companyId: f.company_id, userId: f.user_id }
}

async function syncFlights(
  admin: SupabaseClient,
  owner: SyncOwner,
  flights: ParsedFlight[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const flight of flights) {
    const { data: existing, error: lookupError } = await admin
      .from('flights')
      .select('id, scheduled_departure, aircraft_type, passenger_count')
      .eq('company_id', owner.companyId)
      .eq('flight_number', flight.flight_number)
      .eq('origin', flight.origin)
      .eq('destination', flight.destination)
      .eq('scheduled_arrival', flight.scheduled_arrival)
      .limit(1)

    if (lookupError) throw lookupError

    const row = {
      ...flight,
      company_id: owner.companyId,
      created_by: owner.userId,
      notes: 'Synced from public source',
      is_private: false,
    }

    const existingRow = existing?.[0]
    if (!existingRow) {
      const { error: insertError } = await admin.from('flights').insert(row)
      if (insertError) throw insertError
      inserted += 1
      continue
    }

    const shouldUpdate =
      existingRow.scheduled_departure !== row.scheduled_departure ||
      existingRow.aircraft_type !== row.aircraft_type ||
      existingRow.passenger_count !== row.passenger_count

    if (!shouldUpdate) {
      skipped += 1
      continue
    }

    const { error: updateError } = await admin
      .from('flights')
      .update({
        scheduled_departure: row.scheduled_departure,
        aircraft_type: row.aircraft_type,
        passenger_count: row.passenger_count,
      })
      .eq('id', existingRow.id)
    if (updateError) throw updateError
    updated += 1
  }

  return { inserted, updated, skipped }
}

async function syncCruises(
  admin: SupabaseClient,
  owner: SyncOwner,
  cruises: ParsedCruise[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const cruise of cruises) {
    const { data: existing, error: lookupError } = await admin
      .from('cruise_schedules')
      .select('id, departure_date, vessel_type, passenger_count')
      .eq('company_id', owner.companyId)
      .eq('vessel_name', cruise.vessel_name)
      .eq('arrival_date', cruise.arrival_date)
      .limit(1)

    if (lookupError) throw lookupError

    const row = {
      ...cruise,
      company_id: owner.companyId,
      created_by: owner.userId,
      notes: 'Synced from public source',
      is_private: false,
    }

    const existingRow = existing?.[0]
    if (!existingRow) {
      const { error: insertError } = await admin.from('cruise_schedules').insert(row)
      if (insertError) throw insertError
      inserted += 1
      continue
    }

    const shouldUpdate =
      existingRow.departure_date !== row.departure_date ||
      existingRow.vessel_type !== row.vessel_type ||
      existingRow.passenger_count !== row.passenger_count

    if (!shouldUpdate) {
      skipped += 1
      continue
    }

    const { error: updateError } = await admin
      .from('cruise_schedules')
      .update({
        departure_date: row.departure_date,
        vessel_type: row.vessel_type,
        passenger_count: row.passenger_count,
      })
      .eq('id', existingRow.id)
    if (updateError) throw updateError
    updated += 1
  }

  return { inserted, updated, skipped }
}

export async function runPublicDataSync(
  admin: SupabaseClient,
  options?: { includeApiFlights?: boolean },
): Promise<PublicDataSyncSummary> {
  const warnings: string[] = []
  const cruiseUrl =
    process.env.GIBRALTAR_CRUISE_SCHEDULE_URL ||
    'https://www.gibraltarport.com/cruise/schedules'
  const airportUrl =
    process.env.GIBRALTAR_AIRPORT_FLIGHTS_URL ||
    'https://www.gibraltarairport.gi/airlines-and-destinations/live-flight-information'

  const [cruiseHtml, airportHtml] = await Promise.all([fetchText(cruiseUrl), fetchText(airportUrl)])
  let flights = parseFlightsFromHtml(airportHtml)
  const cruises = parseCruisesFromHtml(cruiseHtml)

  const { data: settings } = await admin
    .from('app_settings')
    .select('aviation_api_key')
    .eq('id', SETTINGS_ID)
    .maybeSingle()

  const aviationApiKey = settings?.aviation_api_key || process.env.AVIATIONSTACK_API_KEY

  if (options?.includeApiFlights !== false && aviationApiKey) {
    const apiUrls = process.env.FREE_FLIGHT_API_URL
      ? [process.env.FREE_FLIGHT_API_URL]
      : buildAviationStackWindowUrls(aviationApiKey)
    try {
      for (const apiUrl of apiUrls) {
        flights = [...flights, ...(await fetchAllAviationStackFlightsForUrl(apiUrl))]
      }
      if (!process.env.FREE_FLIGHT_API_URL && flights.length === 0) {
        const fallbackUrls = ['arr_iata', 'dep_iata'].map(
          (key) =>
            `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(aviationApiKey)}&${key}=${DEFAULT_DESTINATION_AIRPORT}`,
        )
        for (const apiUrl of fallbackUrls) {
          flights = [...flights, ...(await fetchAllAviationStackFlightsForUrl(apiUrl))]
        }
        if (flights.length > 0) {
          warnings.push(
            'AviationStack date-window queries returned no flights; used non-date fallback endpoints for GIB arrivals/departures.',
          )
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flight API sync failed.'
      warnings.push(redactSensitiveText(message))
    }
  } else if (options?.includeApiFlights !== false) {
    warnings.push(
      'No AviationStack key configured. Set app_settings.aviation_api_key or AVIATIONSTACK_API_KEY.',
    )
  }

  const dedupedFlights = Array.from(
    new Map(
      flights.map((f) => [
        `${f.flight_number}|${f.origin}|${f.destination}|${f.scheduled_arrival}`,
        f,
      ]),
    ).values(),
  )

  const dedupedCruises = Array.from(
    new Map(cruises.map((c) => [`${c.vessel_name}|${c.arrival_date}`, c])).values(),
  )

  if (dedupedFlights.length === 0) {
    warnings.push('No flights parsed from sources.')
  }
  if (dedupedCruises.length === 0) {
    warnings.push('No cruise schedules parsed from sources.')
  }

  const owner = await resolveSyncOwner(admin)
  const flightResults = await syncFlights(admin, owner, dedupedFlights)
  const cruiseResults = await syncCruises(admin, owner, dedupedCruises)

  return {
    flights_inserted: flightResults.inserted,
    flights_updated: flightResults.updated,
    flights_skipped: flightResults.skipped,
    cruises_inserted: cruiseResults.inserted,
    cruises_updated: cruiseResults.updated,
    cruises_skipped: cruiseResults.skipped,
    warnings,
  }
}
