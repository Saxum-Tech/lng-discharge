-- Migration: 001_initial_schema
-- Creates all core tables with RLS policies

-- ─── Extensions ───────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── app_settings ─────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  id                          uuid primary key default uuid_generate_v4(),
  app_name                    text not null default 'LNG Discharge Planner',
  logo_url                    text,
  favicon_url                 text,
  primary_color               text not null default '#0A4381',
  accent_color                text not null default '#00a8e8',
  min_discharge_window_hours  numeric(5,2) not null default 4,
  footer_text                 text,
  timezone                    text not null default 'Europe/Gibraltar',
  aviation_api_key            text,
  auto_sync_enabled           boolean not null default false,
  updated_at                  timestamptz not null default now()
);

-- Seed a single settings row on first deploy
insert into public.app_settings (id) values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ─── companies ────────────────────────────────────────────────────────────
create table if not exists public.companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  type        text not null default 'Other',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── profiles ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  company_id  uuid references public.companies (id) on delete set null,
  role        text not null default 'viewer'
                check (role in ('superadmin', 'company_admin', 'viewer')),
  full_name   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

-- ─── flights ──────────────────────────────────────────────────────────────
create table if not exists public.flights (
  id                    uuid primary key default uuid_generate_v4(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  flight_number         text not null,
  origin                text not null,
  destination           text not null,
  scheduled_arrival     timestamptz not null,
  scheduled_departure   timestamptz,
  aircraft_type         text,
  passenger_count       integer,
  is_private            boolean not null default false,
  notes                 text,
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── cruise_schedules ─────────────────────────────────────────────────────
create table if not exists public.cruise_schedules (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  vessel_name       text not null,
  vessel_type       text,
  arrival_date      timestamptz not null,
  departure_date    timestamptz,
  passenger_count   integer,
  is_private        boolean not null default false,
  notes             text,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── audit_logs ───────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,
  table_name  text not null,
  record_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────
create index if not exists flights_company_id_idx on public.flights (company_id);
create index if not exists flights_arrival_idx on public.flights (scheduled_arrival);
create index if not exists cruise_company_id_idx on public.cruise_schedules (company_id);
create index if not exists cruise_arrival_idx on public.cruise_schedules (arrival_date);
create index if not exists profiles_user_id_idx on public.profiles (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- ─── Helper function: get current user role ───────────────────────────────
create or replace function public.current_user_role()
returns text
language sql stable
as $$
  select role from public.profiles where user_id = auth.uid() limit 1;
$$;

-- ─── Helper function: get current user company_id ─────────────────────────
create or replace function public.current_user_company()
returns uuid
language sql stable
as $$
  select company_id from public.profiles where user_id = auth.uid() limit 1;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────

alter table public.app_settings       enable row level security;
alter table public.companies          enable row level security;
alter table public.profiles           enable row level security;
alter table public.flights            enable row level security;
alter table public.cruise_schedules   enable row level security;
alter table public.audit_logs         enable row level security;

-- app_settings: anyone authenticated can read; only superadmin can write
create policy "app_settings_read"
  on public.app_settings for select
  using (auth.role() = 'authenticated');

create policy "app_settings_write"
  on public.app_settings for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- companies: authenticated can read active; superadmin full access
create policy "companies_read"
  on public.companies for select
  using (auth.role() = 'authenticated' and is_active = true);

create policy "companies_superadmin_all"
  on public.companies for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- profiles: own profile readable; superadmin full; company_admin reads own company
create policy "profiles_own_read"
  on public.profiles for select
  using (user_id = auth.uid());

create policy "profiles_superadmin_all"
  on public.profiles for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

create policy "profiles_company_admin_read"
  on public.profiles for select
  using (
    public.current_user_role() = 'company_admin'
    and company_id = public.current_user_company()
  );

-- flights: public (non-private) visible to all authenticated; private only to own company; write own company only
create policy "flights_read_public"
  on public.flights for select
  using (auth.role() = 'authenticated' and is_private = false);

create policy "flights_read_own_private"
  on public.flights for select
  using (
    auth.role() = 'authenticated'
    and is_private = true
    and company_id = public.current_user_company()
  );

create policy "flights_insert_own_company"
  on public.flights for insert
  with check (
    auth.role() = 'authenticated'
    and company_id = public.current_user_company()
  );

create policy "flights_update_own_company"
  on public.flights for update
  using (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create policy "flights_delete_own_company"
  on public.flights for delete
  using (company_id = public.current_user_company());

create policy "flights_superadmin_all"
  on public.flights for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- cruise_schedules: same pattern as flights
create policy "cruise_read_public"
  on public.cruise_schedules for select
  using (auth.role() = 'authenticated' and is_private = false);

create policy "cruise_read_own_private"
  on public.cruise_schedules for select
  using (
    auth.role() = 'authenticated'
    and is_private = true
    and company_id = public.current_user_company()
  );

create policy "cruise_insert_own_company"
  on public.cruise_schedules for insert
  with check (
    auth.role() = 'authenticated'
    and company_id = public.current_user_company()
  );

create policy "cruise_update_own_company"
  on public.cruise_schedules for update
  using (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create policy "cruise_delete_own_company"
  on public.cruise_schedules for delete
  using (company_id = public.current_user_company());

create policy "cruise_superadmin_all"
  on public.cruise_schedules for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- audit_logs: superadmin read only; insert by all authenticated via trigger
create policy "audit_logs_superadmin_read"
  on public.audit_logs for select
  using (public.current_user_role() = 'superadmin');

create policy "audit_logs_insert"
  on public.audit_logs for insert
  with check (auth.role() = 'authenticated');

-- ─── Auto-create profile on user sign-up ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── updated_at trigger ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flights_updated_at before update on public.flights
  for each row execute function public.set_updated_at();

create trigger cruise_updated_at before update on public.cruise_schedules
  for each row execute function public.set_updated_at();
