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

export type MaritimeHourlyForecast = {
  time: string
  date: string
  hour: number
  windSpeed: number | null
  windGust: number | null
  windDirection: number | null
  waveHeight: number | null
  waveDirection: number | null
  wavePeriod: number | null
}

export const MPS_TO_KNOTS = 1.943844
export const BERTHING_WAVE_LIMIT_M = 1.0
export const BERTHING_WIND_LIMIT_MS = 10
export const BERTHING_WIND_LIMIT_KN = BERTHING_WIND_LIMIT_MS * MPS_TO_KNOTS
const WAVE_PERIOD_SHORT_MAX_S = 6
const WAVE_PERIOD_MEDIUM_MAX_S = 9

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

type OpenMeteoHourlyResponse = {
  hourly?: {
    time?: string[]
    wind_speed_10m?: number[]
    wind_gusts_10m?: number[]
    wind_direction_10m?: number[]
    wave_height?: number[]
    wave_direction?: number[]
    wave_period?: number[]
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

function calculateDirectionalWeatherLimits(day: MaritimeDailyForecast): {
  maxWindKn: number
  maxWaveM: number
} | null {
  if (day.waveDirectionDominant == null || day.wavePeriodMax == null) return null

  const direction = ((day.waveDirectionDominant % 360) + 360) % 360
  const period = day.wavePeriodMax
  const periodBand = period <= WAVE_PERIOD_SHORT_MAX_S ? 5 : period <= WAVE_PERIOD_MEDIUM_MAX_S ? 8 : 10

  if (direction >= 180 && direction < 210) {
    return {
      maxWindKn: 15 * MPS_TO_KNOTS,
      maxWaveM: 1,
    }
  }
  if (direction >= 210 && direction < 240) {
    return {
      maxWindKn: 12.5 * MPS_TO_KNOTS,
      maxWaveM: periodBand === 5 ? 0.9 : periodBand === 8 ? 0.75 : 0.5,
    }
  }
  if (direction >= 240 && direction < 270) {
    return {
      maxWindKn: 12.5 * MPS_TO_KNOTS,
      maxWaveM: periodBand === 5 ? 0.75 : periodBand === 8 ? 0.5 : 0.3,
    }
  }

  if ((direction >= 270 && direction < 360) || (direction >= 0 && direction < 180)) {
    return {
      maxWindKn: 10 * MPS_TO_KNOTS,
      maxWaveM: periodBand === 5 ? 0.5 : periodBand === 8 ? 0.3 : 0.2,
    }
  }

  return null
}

export function getWeatherSafetyStatus(day: MaritimeDailyForecast): {
  isUnsafe: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  const wind = day.windSpeedMax ?? 0
  const wave = day.waveHeightMax ?? 0

  if (wind > BERTHING_WIND_LIMIT_KN) {
    reasons.push(
      `Wind exceeds berthing limit (${BERTHING_WIND_LIMIT_MS} m/s / ${BERTHING_WIND_LIMIT_KN.toFixed(1)} kn)`,
    )
  }
  if (wave > BERTHING_WAVE_LIMIT_M) {
    reasons.push(`Wave exceeds berthing limit (${BERTHING_WAVE_LIMIT_M.toFixed(1)} m)`)
  }

  const directionalLimits = calculateDirectionalWeatherLimits(day)
  if (directionalLimits) {
    if (wind > directionalLimits.maxWindKn) {
      reasons.push('Wind exceeds alongside directional limit')
    }
    if (wave > directionalLimits.maxWaveM) {
      reasons.push('Wave exceeds alongside directional/period limit')
    }
  }

  return {
    isUnsafe: reasons.length > 0,
    reasons,
  }
}

async function fetchOpenMeteo(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Open-Meteo API request failed (${response.status})`)
  return (await response.json()) as OpenMeteoDailyResponse
}

async function fetchOpenMeteoHourly(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Open-Meteo API request failed (${response.status})`)
  return (await response.json()) as OpenMeteoHourlyResponse
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

export async function fetchMaritimeHourlyForecast(days = 14): Promise<MaritimeHourlyForecast[]> {
  const baseParams = {
    latitude: PORT_COORDINATES.latitude.toString(),
    longitude: PORT_COORDINATES.longitude.toString(),
    forecast_days: String(days),
    timezone: 'auto',
  }

  const weatherParams = new URLSearchParams({
    ...baseParams,
    hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    wind_speed_unit: 'kn',
  })

  const marineParams = new URLSearchParams({
    ...baseParams,
    hourly: 'wave_height,wave_direction,wave_period',
  })

  const [weatherData, marineData] = await Promise.all([
    fetchOpenMeteoHourly(`https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`),
    fetchOpenMeteoHourly(`https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`),
  ])

  const times = weatherData.hourly?.time ?? marineData.hourly?.time ?? []
  const windSpeed = weatherData.hourly?.wind_speed_10m ?? []
  const gusts = weatherData.hourly?.wind_gusts_10m ?? []
  const windDirection = weatherData.hourly?.wind_direction_10m ?? []
  const waveHeight = marineData.hourly?.wave_height ?? []
  const waveDirection = marineData.hourly?.wave_direction ?? []
  const wavePeriod = marineData.hourly?.wave_period ?? []

  return times.map((time, i) => ({
    time,
    date: time.slice(0, 10),
    hour: Number.parseInt(time.slice(11, 13), 10),
    windSpeed: windSpeed[i] ?? null,
    windGust: gusts[i] ?? null,
    windDirection: windDirection[i] ?? null,
    waveHeight: waveHeight[i] ?? null,
    waveDirection: waveDirection[i] ?? null,
    wavePeriod: wavePeriod[i] ?? null,
  }))
}
