export const PORT_COORDINATES = {
  latitude: 36.148889,
  longitude: -5.366639,
}

export type MaritimeDailyForecast = {
  date: string
  weatherCode: number | null
  windSpeedMax: number | null
  windGustsMax: number | null
  windDirectionDominant: number | null
  waveHeightMax: number | null
  waveDirectionDominant: number | null
  wavePeriodMax: number | null
}

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[]
    weather_code?: number[]
    wind_speed_10m_max?: number[]
    wind_gusts_10m_max?: number[]
    wind_direction_10m_dominant?: number[]
    wave_height_max?: number[]
    wave_direction_dominant?: number[]
    wave_period_max?: number[]
  }
}

export function getWeatherPresentation(code: number | null) {
  if (code == null) return { label: 'Unknown', icon: '❔', isAdverse: false }
  if (code === 0) return { label: 'Clear sky', icon: '☀️', isAdverse: false }
  if (code <= 3) return { label: 'Partly cloudy', icon: '⛅', isAdverse: false }
  if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️', isAdverse: true }
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: '🌦️', isAdverse: true }
  if ([61, 63, 65, 66, 67].includes(code)) return { label: 'Rain', icon: '🌧️', isAdverse: true }
  if ([71, 73, 75, 77].includes(code)) return { label: 'Snow', icon: '❄️', isAdverse: true }
  if ([80, 81, 82].includes(code)) return { label: 'Rain showers', icon: '🌧️', isAdverse: true }
  if ([85, 86].includes(code)) return { label: 'Snow showers', icon: '🌨️', isAdverse: true }
  if (code === 95) return { label: 'Thunderstorm', icon: '⛈️', isAdverse: true }
  if ([96, 99].includes(code)) return { label: 'Thunderstorm with hail', icon: '⛈️', isAdverse: true }
  return { label: 'Cloudy', icon: '☁️', isAdverse: false }
}

export function degreesToArrow(degrees: number | null) {
  if (degrees == null || Number.isNaN(degrees)) return '•'
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return arrows[index]
}

async function fetchOpenMeteo(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Open-Meteo API request failed (${response.status})`)
  return (await response.json()) as OpenMeteoDailyResponse
}

export async function fetchMaritimeForecast(days = 14): Promise<MaritimeDailyForecast[]> {
  const baseParams = {
    latitude: PORT_COORDINATES.latitude.toString(),
    longitude: PORT_COORDINATES.longitude.toString(),
    forecast_days: String(days),
    timezone: 'auto',
  }

  const weatherParams = new URLSearchParams({
    ...baseParams,
    daily: 'weather_code,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
    wind_speed_unit: 'kn',
  })

  const marineParams = new URLSearchParams({
    ...baseParams,
    daily: 'wave_height_max,wave_direction_dominant,wave_period_max',
  })

  const [weatherData, marineData] = await Promise.all([
    fetchOpenMeteo(`https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`),
    fetchOpenMeteo(`https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`),
  ])

  const dates = weatherData.daily?.time ?? marineData.daily?.time ?? []
  const weatherCode = weatherData.daily?.weather_code ?? []
  const windSpeed = weatherData.daily?.wind_speed_10m_max ?? []
  const gusts = weatherData.daily?.wind_gusts_10m_max ?? []
  const windDirection = weatherData.daily?.wind_direction_10m_dominant ?? []
  const waveHeight = marineData.daily?.wave_height_max ?? []
  const waveDirection = marineData.daily?.wave_direction_dominant ?? []
  const wavePeriod = marineData.daily?.wave_period_max ?? []

  return dates.map((date, i) => ({
    date,
    weatherCode: weatherCode[i] ?? null,
    windSpeedMax: windSpeed[i] ?? null,
    windGustsMax: gusts[i] ?? null,
    windDirectionDominant: windDirection[i] ?? null,
    waveHeightMax: waveHeight[i] ?? null,
    waveDirectionDominant: waveDirection[i] ?? null,
    wavePeriodMax: wavePeriod[i] ?? null,
  }))
}
