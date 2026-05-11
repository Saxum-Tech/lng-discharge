'use client'

import { useEffect, useMemo, useState } from 'react'
import { addDays, format, isAfter, parseISO, startOfDay } from 'date-fns'
import { fetchMaritimeForecast, type MaritimeDailyForecast, PORT_COORDINATES } from '@/lib/open-meteo'

type MaritimeWeatherWidgetProps = {
  selectedDate?: string
}

const formatNumber = (value: number | null, digits = 1) => (value == null ? '—' : value.toFixed(digits))

export function MaritimeWeatherWidget({ selectedDate }: MaritimeWeatherWidgetProps) {
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

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Maritime Weather (Next 14 Days)</h2>
          <p className="text-xs text-gray-500">
            Open-Meteo forecast for {PORT_COORDINATES.latitude.toFixed(6)}, {PORT_COORDINATES.longitude.toFixed(6)}. Refreshes hourly on the hour.
          </p>
        </div>
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
              <p>
                Wind {formatNumber(highlightedDay.windSpeedMax)} kn (gusts {formatNumber(highlightedDay.windGustsMax)} kn), wave height {formatNumber(highlightedDay.waveHeightMax)} m.
              </p>
            </div>
          )}

          {selectedDayMessage && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {selectedDayMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2">Day</th>
                  <th className="px-2 py-2">Wind max (kn)</th>
                  <th className="px-2 py-2">Gust max (kn)</th>
                  <th className="px-2 py-2">Swell / wave max (m)</th>
                  <th className="px-2 py-2">Wave period max (s)</th>
                  <th className="px-2 py-2">Wave dir (°)</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((day) => (
                  <tr key={day.date} className={`border-b border-gray-100 ${selectedDate === day.date ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2 font-medium text-gray-700">{format(parseISO(day.date), 'EEE dd MMM')}</td>
                    <td className="px-2 py-2">{formatNumber(day.windSpeedMax)}</td>
                    <td className="px-2 py-2">{formatNumber(day.windGustsMax)}</td>
                    <td className="px-2 py-2">{formatNumber(day.waveHeightMax)}</td>
                    <td className="px-2 py-2">{formatNumber(day.wavePeriodMax)}</td>
                    <td className="px-2 py-2">{formatNumber(day.waveDirectionDominant, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
