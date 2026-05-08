import type { SupabaseClient } from '@supabase/supabase-js'

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

export type PublicDataSyncSummary = {
  flights_inserted: number
  flights_updated: number
  flights_skipped: number
  cruises_inserted: number
  cruises_updated: number
  cruises_skipped: number
  warnings: string[]
}

function stripTags(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()

  const dayFirst = trimmed.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  )
  if (dayFirst) {
    const day = dayFirst[1].padStart(2, '0')
    const month = dayFirst[2].padStart(2, '0')
    const yearRaw = dayFirst[3]
    const year =
      yearRaw.length === 2
        ? `${Number.parseInt(yearRaw, 10) >= 50 ? '19' : '20'}${yearRaw}`
        : yearRaw
    const hour = (dayFirst[4] ?? '00').padStart(2, '0')
    const minute = dayFirst[5] ?? '00'
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
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

function toPassengerCount(value: string): number | null {
  const match = value.replace(/,/g, '').match(/\b(\d{1,6})\b/)
  return match ? Number.parseInt(match[1], 10) : null
}

function parseCruisesFromHtml(html: string): ParsedCruise[] {
  const rows = extractRows(html)
  const results: ParsedCruise[] = []

  for (const row of rows) {
    if (row.length < 2) continue
    const vessel = row[0]
    const arrival = normalizeDate(row[1])
    if (!vessel || !arrival) continue
    const departure = row[2] ? normalizeDate(row[2]) : null
    const vesselType =
      row.find((c) => /(cruise|ferry|liner|vessel|ship)/i.test(c) && c !== vessel) ?? null
    const passengerCount = row.map(toPassengerCount).find((n) => n !== null) ?? null

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

function looksLikeFlightNumber(value: string): boolean {
  return /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/.test(value.trim().toUpperCase())
}

function parseFlightsFromHtml(html: string): ParsedFlight[] {
  const rows = extractRows(html)
  const results: ParsedFlight[] = []

  for (const row of rows) {
    if (row.length < 4) continue
    const maybeFlight = row.find(looksLikeFlightNumber)
    if (!maybeFlight) continue

    const timeValue = row.map(normalizeDate).find((d) => d !== null)
    if (!timeValue) continue

    const cleaned = maybeFlight.toUpperCase().replace(/\s+/g, '')
    const origin = row.find((c) => /^[A-Z]{3}$/.test(c.trim().toUpperCase())) ?? 'UNKNOWN'
    const destinationGuess =
      row.find((c) => /gib|gibraltar/i.test(c)) ??
      row.filter((c) => /^[A-Z]{3}$/.test(c.trim().toUpperCase()))[1] ??
      'GIB'
    const passengerCount = row.map(toPassengerCount).find((n) => n !== null) ?? null

    results.push({
      flight_number: cleaned,
      origin,
      destination: destinationGuess,
      scheduled_arrival: timeValue,
      scheduled_departure: null,
      aircraft_type: null,
      passenger_count: passengerCount,
    })
  }

  return results
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
      origin: record.departure?.iata || record.departure?.airport || 'UNKNOWN',
      destination: record.arrival?.iata || record.arrival?.airport || 'GIB',
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
    throw new Error(`Fetch failed (${response.status}) for ${url}`)
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
    throw new Error(`Fetch failed (${response.status}) for ${url}`)
  }
  return response.json()
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
    'https://www.gibraltarport.com/shipping/cruise-schedule'
  const airportUrl =
    process.env.GIBRALTAR_AIRPORT_FLIGHTS_URL || 'https://www.gibraltarairport.gi/flight-information'

  const [cruiseHtml, airportHtml] = await Promise.all([fetchText(cruiseUrl), fetchText(airportUrl)])
  let flights = parseFlightsFromHtml(airportHtml)
  const cruises = parseCruisesFromHtml(cruiseHtml)

  const { data: settings } = await admin
    .from('app_settings')
    .select('aviation_api_key')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (options?.includeApiFlights !== false && settings?.aviation_api_key) {
    const defaultUrl = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(settings.aviation_api_key)}&arr_iata=GIB`
    const apiUrl = process.env.FREE_FLIGHT_API_URL || defaultUrl
    try {
      const apiData = await fetchJson(apiUrl)
      flights = [...flights, ...parseFlightsFromApi(apiData)]
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Flight API sync failed.')
    }
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
