'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppSettings, UpdateAppSettingsPayload } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

const TIMEZONES = [
  'Europe/Gibraltar',
  'Europe/London',
  'Europe/Madrid',
  'Atlantic/Canary',
  'UTC',
]

export default function SystemSettingsPage() {
  const [, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [minHours, setMinHours] = useState(4)
  const [timezone, setTimezone] = useState('Europe/Gibraltar')
  const [aviationApiKey, setAviationApiKey] = useState('')
  const [autoSync, setAutoSync] = useState(false)

  async function fetchSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .single()
    if (data) {
      setSettings(data)
      setMinHours(data.min_discharge_window_hours ?? 4)
      setTimezone(data.timezone ?? 'Europe/Gibraltar')
      setAviationApiKey(data.aviation_api_key ?? '')
      setAutoSync(data.auto_sync_enabled ?? false)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const payload: UpdateAppSettingsPayload = {
      min_discharge_window_hours: minHours,
      timezone,
      aviation_api_key: aviationApiKey || null,
      auto_sync_enabled: autoSync,
    }
    const { error } = await supabase
      .from('app_settings')
      .update(payload)
      .eq('id', SETTINGS_ID)
    setSaving(false)
    if (error) setError(error.message)
    else setMessage('Settings saved.')
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">System Settings</h1>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-lg space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Discharge windows</CardTitle>
            </CardHeader>
            <Input
              label="Minimum window threshold (hours)"
              type="number"
              min={0}
              step={0.5}
              value={minHours}
              onChange={(e) => setMinHours(parseFloat(e.target.value))}
              required
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timezone</CardTitle>
            </CardHeader>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aviation data sync</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <Input
                label="Aviation API key"
                type="password"
                value={aviationApiKey}
                onChange={(e) => setAviationApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="off"
              />
              <div className="flex items-center gap-3">
                <input
                  id="auto-sync"
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                />
                <label htmlFor="auto-sync" className="text-sm text-gray-700">
                  Enable public data auto-sync
                </label>
              </div>
            </div>
          </Card>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={saving} size="lg">
            Save settings
          </Button>
        </form>
      )}
    </div>
  )
}
