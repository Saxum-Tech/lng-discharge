export const PORT_COORDINATES = {
  latitude: 36.148889,
  longitude: -5.366639,
}

export type MaritimeDailyForecast = {
  date: string
  windSpeedMax: number | null
  windGustsMax: number | null
  waveHeightMax: number | null
  waveDirectionDominant: number | null
  wavePeriodMax: number | null
}

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[]
    wind_speed_10m_max?: number[]
    wind_gusts_10m_max?: number[]
    wave_height_max?: number[]
    wave_direction_dominant?: number[]
    wave_period_max?: number[]
  }
}

export async function fetchMaritimeForecast(days = 14): Promise<MaritimeDailyForecast[]> {
  const params = new URLSearchParams({
    latitude: PORT_COORDINATES.latitude.toString(),
    longitude: PORT_COORDINATES.longitude.toString(),
    forecast_days: String(days),
    timezone: 'auto',
    daily:
      'wind_speed_10m_max,wind_gusts_10m_max,wave_height_max,wave_direction_dominant,wave_period_max',
    wind_speed_unit: 'kn',
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Open-Meteo API request failed (${response.status})`)
  }

  const data = (await response.json()) as OpenMeteoDailyResponse
  const dates = data.daily?.time ?? []
  const windSpeed = data.daily?.wind_speed_10m_max ?? []
  const gusts = data.daily?.wind_gusts_10m_max ?? []
  const waveHeight = data.daily?.wave_height_max ?? []
  const waveDirection = data.daily?.wave_direction_dominant ?? []
  const wavePeriod = data.daily?.wave_period_max ?? []

  return dates.map((date, i) => ({
    date,
    windSpeedMax: windSpeed[i] ?? null,
    windGustsMax: gusts[i] ?? null,
    waveHeightMax: waveHeight[i] ?? null,
    waveDirectionDominant: waveDirection[i] ?? null,
    wavePeriodMax: wavePeriod[i] ?? null,
  }))
}
