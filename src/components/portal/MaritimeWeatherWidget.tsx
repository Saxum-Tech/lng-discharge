'use client'

import { useEffect, useMemo, useState } from 'react'
import { addDays, format, isAfter, parseISO, startOfDay } from 'date-fns'
import { Waves, Wind } from 'lucide-react'
import {
  fetchMaritimeForecast,
  degreesToCardinal,
  getWeatherPresentation,
  getWeatherSafetyStatus,
  BERTHING_WAVE_LIMIT_M,
  BERTHING_WIND_LIMIT_MS,
  type MaritimeDailyForecast,
} from '@/lib/open-meteo'
import { DirectionArrow } from '@/components/DirectionArrow'

type MaritimeWeatherWidgetProps = {
  selectedDate?: string
  compact?: boolean
}

const formatNumber = (value: number | null, digits = 1) => (value == null ? '—' : value.toFixed(digits))

export function MaritimeWeatherWidget({ selectedDate, compact = false }: MaritimeWeatherWidgetProps) {
  const [forecast, setForecast] = useState<MaritimeDailyForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let intervalId: ReturnType<typeof setInterval> | undefined
    let mounted = true

    const load = async () => {
      try {
        const data = await fetchMaritimeForecast(14)
        if (!mounted) return
        setForecast(data)
        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Unable to load weather data')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    const scheduleHourlyRefresh = () => {
      const now = new Date()
      const nextHour = new Date(now)
      nextHour.setMinutes(0, 0, 0)
      nextHour.setHours(nextHour.getHours() + 1)
      const msUntilNextHour = nextHour.getTime() - now.getTime()

      timeoutId = setTimeout(() => {
        load()
        intervalId = setInterval(load, 60 * 60 * 1000)
      }, msUntilNextHour)
    }

    void load()
    scheduleHourlyRefresh()

    return () => {
      mounted = false
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const highlightedDay = useMemo(() => {
    if (!selectedDate) return null
    return forecast.find((day) => day.date === selectedDate) ?? null
  }, [forecast, selectedDate])

  const selectedDayMessage = useMemo(() => {
    if (!selectedDate || loading || error) return null
    if (highlightedDay) return null

    const selected = parseISO(`${selectedDate}T00:00:00`)
    const afterWindow = isAfter(startOfDay(selected), startOfDay(addDays(new Date(), 13)))

    if (afterWindow) {
      return 'No weather data yet available for this date. Forecast coverage is limited to the rolling next 14 calendar days.'
    }

    return 'No weather data available for this selected date in the current forecast window.'
  }, [selectedDate, loading, error, highlightedDay])

  const shortForecast = forecast.slice(0, 7)
  const adverseDays = forecast.filter((day) => getWeatherPresentation(day.weatherCode).isAdverse || getWeatherSafetyStatus(day).isUnsafe)

  return (
    <section className={compact ? 'mx-auto w-full max-w-6xl px-1 py-2' : 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm'}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Maritime Weather</h2>
        <p className="text-xs text-amber-700">Safety limits: wave ≤ {BERTHING_WAVE_LIMIT_M.toFixed(1)} m · wind ≤ {BERTHING_WIND_LIMIT_MS} m/s.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading weather forecast…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          {highlightedDay && (
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">{format(parseISO(highlightedDay.date), 'EEEE, d MMM yyyy')}</p>
              <p className="flex flex-wrap items-center gap-1">
                {getWeatherPresentation(highlightedDay.weatherCode).icon} {getWeatherPresentation(highlightedDay.weatherCode).label} ·
                <Wind className="h-3 w-3" aria-hidden="true" />
                <DirectionArrow degrees={highlightedDay.windDirectionDominant} /> {degreesToCardinal(highlightedDay.windDirectionDominant) ?? "—"} {formatNumber(highlightedDay.windSpeedMax)} kn (gusts {formatNumber(highlightedDay.windGustsMax)} kn),
                <Waves className="h-3 w-3" aria-hidden="true" />
                <DirectionArrow degrees={highlightedDay.waveDirectionDominant} /> {degreesToCardinal(highlightedDay.waveDirectionDominant) ?? "—"} {formatNumber(highlightedDay.waveHeightMax)} m @ {formatNumber(highlightedDay.wavePeriodMax)} s.
              </p>
            </div>
          )}

          {selectedDayMessage && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{selectedDayMessage}</div>}

          {adverseDays.length > 0 && (
            <div className="mb-2 text-xs text-amber-900">
              <span className="font-semibold">Adverse weather watch:</span> {adverseDays.map((day) => format(parseISO(day.date), 'dd MMM')).join(', ')}
            </div>
          )}

          <div className={`flex w-full gap-2 overflow-x-auto pb-1 ${compact ? 'justify-center whitespace-nowrap' : ''}`}>
            {shortForecast.map((day) => {
              const weather = getWeatherPresentation(day.weatherCode)
              const safety = getWeatherSafetyStatus(day)
              const isSelected = selectedDate === day.date
              return (
                <div key={day.date} className={`rounded-lg border p-2 text-center ${isSelected ? 'border-blue-300 bg-blue-50' : weather.isAdverse || safety.isUnsafe ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className="text-[11px] font-semibold text-gray-600">{format(parseISO(day.date), 'EEE dd')}</p>
                  <p className="text-xl" aria-label={weather.label}>{weather.icon}</p>
                  <p className="truncate text-[11px] text-gray-700">{weather.label}</p>
                  <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
                    <Wind className="h-3 w-3" aria-hidden="true" />
                    <DirectionArrow degrees={day.windDirectionDominant} /> {degreesToCardinal(day.windDirectionDominant) ?? "—"} {formatNumber(day.windSpeedMax, 0)} kn
                  </p>
                  <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
                    <Waves className="h-3 w-3" aria-hidden="true" />
                    <DirectionArrow degrees={day.waveDirectionDominant} /> {degreesToCardinal(day.waveDirectionDominant) ?? "—"} {formatNumber(day.waveHeightMax)} m / {formatNumber(day.wavePeriodMax)} s
                  </p>
                  {safety.isUnsafe && <p className="mt-1 text-[10px] font-semibold text-amber-800">Safety limit exceeded</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
