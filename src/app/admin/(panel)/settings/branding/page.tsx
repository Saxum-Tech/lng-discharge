'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppSettings, UpdateAppSettingsPayload } from '@/lib/types'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Upload } from 'lucide-react'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Only allow http/https URLs for image sources to prevent javascript: URI injection.
 */
function sanitizeImageUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    // not a valid URL
  }
  return undefined
}

export default function BrandingPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Form state
  const [appName, setAppName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0f4c81')
  const [accentColor, setAccentColor] = useState('#00a8e8')
  const [footerText, setFooterText] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')

  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  async function fetchSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()
    if (data) {
      setAppName(data.app_name ?? '')
      setPrimaryColor(data.primary_color ?? '#0f4c81')
      setAccentColor(data.accent_color ?? '#00a8e8')
      setFooterText(data.footer_text ?? '')
      setLogoUrl(data.logo_url ?? '')
      setFaviconUrl(data.favicon_url ?? '')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  async function uploadFile(file: File, path: string): Promise<string> {
    const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('branding').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadFile(file, `logo/${file.name}`)
      setLogoUrl(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadFile(file, `favicon/${file.name}`)
      setFaviconUrl(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const payload: UpdateAppSettingsPayload = {
      app_name: appName,
      primary_color: primaryColor,
      accent_color: accentColor,
      footer_text: footerText || null,
      logo_url: logoUrl || null,
      favicon_url: faviconUrl || null,
    }
    const { error } = await supabase
      .from('app_settings')
      .update(payload)
      .eq('id', SETTINGS_ID)
    setSaving(false)
    if (error) setError(error.message)
    else setMessage('Branding saved successfully.')
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Branding &amp; Theme</h1>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Form */}
          <form onSubmit={handleSave} className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>App identity</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input
                  label="App name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  required
                />

                {/* Logo upload */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Logo</label>
                  <div className="flex items-center gap-4">
                    {(() => {
                      const safeLogoUrl = sanitizeImageUrl(logoUrl)
                      return safeLogoUrl ? (
                        <img
                          src={safeLogoUrl}
                          alt="Logo preview"
                          className="h-12 w-auto rounded border border-gray-200 object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 text-xs">
                          No logo
                        </div>
                      )
                    })()}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload size={14} /> Upload
                    </Button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                  {logoUrl && (
                    <Input
                      label="Logo URL (editable)"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  )}
                </div>

                {/* Favicon upload */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Favicon</label>
                  <div className="flex items-center gap-4">
                    {(() => {
                      const safeFaviconUrl = sanitizeImageUrl(faviconUrl)
                      return safeFaviconUrl ? (
                        <img
                          src={safeFaviconUrl}
                          alt="Favicon preview"
                          className="h-8 w-8 rounded border border-gray-200 object-contain"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-gray-300 text-gray-400 text-xs">
                          –
                        </div>
                      )
                    })()}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => faviconInputRef.current?.click()}
                    >
                      <Upload size={14} /> Upload
                    </Button>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/*,.ico"
                      className="hidden"
                      onChange={handleFaviconUpload}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    Footer text (optional)
                  </label>
                  <textarea
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="© 2025 Your Company. All rights reserved."
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Colours</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Primary colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded border border-gray-300 p-1"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="font-mono uppercase"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Accent colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded border border-gray-300 p-1"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={saving} size="lg">
              Save branding
            </Button>
          </form>

          {/* Live preview */}
          <div className="hidden lg:block">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Live preview</CardTitle>
              </CardHeader>
              <div
                className="overflow-hidden rounded-lg border border-gray-200"
                style={
                  {
                    '--preview-primary': primaryColor,
                    '--preview-accent': accentColor,
                  } as React.CSSProperties
                }
              >
                {/* Simulated navbar */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ backgroundColor: primaryColor }}
                >
                  {(() => {
                    const safeLogoUrl = sanitizeImageUrl(logoUrl)
                    return safeLogoUrl ? (
                      <img src={safeLogoUrl} alt="" className="h-6 w-auto" />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-white text-xs font-bold">
                        LNG
                      </div>
                    )
                  })()}
                  <span className="text-sm font-semibold text-white">
                    {appName || 'App Name'}
                  </span>
                </div>

                {/* Simulated content */}
                <div className="bg-white p-4 space-y-3">
                  <div className="h-2 rounded bg-gray-100 w-3/4" />
                  <div
                    className="h-8 rounded text-white text-xs flex items-center px-3 font-medium"
                    style={{ backgroundColor: accentColor }}
                  >
                    Discharge window: 6h 30m
                  </div>
                  <div className="h-2 rounded bg-gray-100 w-1/2" />
                  <div className="h-2 rounded bg-gray-100 w-2/3" />
                </div>

                {/* Simulated footer */}
                {footerText && (
                  <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-400">
                    {footerText}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
