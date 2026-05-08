'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SETTINGS_ID } from '@/lib/constants'
import type { AppSettings } from '@/lib/types'

interface ThemeContextValue {
  settings: AppSettings | null
  loading: boolean
  refresh: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DEFAULT_SETTINGS = {
  primary_color: '#0f4c81',
  accent_color: '#00a8e8',
}

function applyTheme(settings: AppSettings) {
  const root = document.documentElement
  root.style.setProperty('--color-primary', settings.primary_color)
  root.style.setProperty('--color-accent', settings.accent_color)
  if (settings.app_name) document.title = settings.app_name
  if (settings.favicon_url) {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      (() => {
        const l = document.createElement('link')
        l.rel = 'icon'
        document.head.appendChild(l)
        return l
      })()
    link.href = settings.favicon_url
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchSettings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (!error && data) {
      setSettings(data)
      applyTheme(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Apply defaults immediately to prevent flash
    const root = document.documentElement
    root.style.setProperty('--color-primary', DEFAULT_SETTINGS.primary_color)
    root.style.setProperty('--color-accent', DEFAULT_SETTINGS.accent_color)
    fetchSettings()
  }, [])

  return (
    <ThemeContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
