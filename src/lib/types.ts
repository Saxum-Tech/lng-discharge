// ─── Database row types ────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'company_admin' | 'viewer'
export type CompanyType =
  | 'Shipper'
  | 'Terminal Operator'
  | 'Port Authority'
  | 'Customs'
  | 'Agent'
  | 'Other'

export interface AppSettings {
  id: string
  app_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  min_discharge_window_hours: number
  footer_text: string | null
  timezone: string
  aviation_api_key: string | null
  auto_sync_enabled: boolean
  updated_at: string
}

export interface Company {
  id: string
  name: string
  type: CompanyType
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  company_id: string | null
  role: UserRole
  full_name: string | null
  is_active: boolean
  created_at: string
  // joined
  company?: Company
  email?: string
}

export interface Flight {
  id: string
  company_id: string
  flight_number: string
  origin: string
  destination: string
  scheduled_arrival: string // ISO timestamp
  scheduled_departure: string | null
  aircraft_type: string | null
  passenger_count: number | null
  is_private: boolean
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CruiseSchedule {
  id: string
  company_id: string
  vessel_name: string
  vessel_type: string | null
  arrival_date: string // ISO timestamp
  departure_date: string | null
  passenger_count: number | null
  is_private: boolean
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  table_name: string
  record_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  // joined
  profile?: Pick<Profile, 'full_name' | 'role'>
}

// ─── Computed types ────────────────────────────────────────────────────────

export interface DischargeWindow {
  date: string // YYYY-MM-DD
  start_time: string // ISO timestamp — end of last event
  end_time: string // ISO timestamp — start of next event
  duration_hours: number
  is_longest_of_month: boolean
}

export interface DayEvent {
  id: string
  type: 'flight' | 'cruise'
  title: string
  time: string // ISO timestamp
  end_time?: string
  is_private: boolean
  company_id: string
}

// ─── API / Form types ─────────────────────────────────────────────────────

export type CreateFlightPayload = Omit<Flight, 'id' | 'created_by' | 'created_at' | 'updated_at'>
export type UpdateFlightPayload = Partial<CreateFlightPayload>

export type CreateCruisePayload = Omit<
  CruiseSchedule,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>
export type UpdateCruisePayload = Partial<CreateCruisePayload>

export type UpdateAppSettingsPayload = Partial<Omit<AppSettings, 'id' | 'updated_at'>>

export type CreateCompanyPayload = Omit<Company, 'id' | 'created_at'>
export type UpdateCompanyPayload = Partial<CreateCompanyPayload>

export type InviteUserPayload = {
  email: string
  full_name: string
  role: UserRole
  company_id: string | null
}
