-- Ensure ferry and planned discharge planning relations exist in environments
-- where earlier migrations were partially applied.

create extension if not exists "uuid-ossp";

create table if not exists public.ferries (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  vessel_name       text not null,
  operator_name     text,
  arrival_time      timestamptz not null,
  departure_time    timestamptz,
  vehicle_capacity  integer,
  passenger_count   integer,
  is_private        boolean not null default false,
  notes             text,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  data_source       text not null default 'manual_ui'
);

create table if not exists public.planned_discharges (
  id                   uuid primary key default uuid_generate_v4(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  discharge_date       date not null,
  discharge_time       time,
  lng_volume_m3        numeric(12,2),
  terminal             text,
  vessel_name          text,
  status               text not null default 'planned'
                         check (status in ('planned', 'confirmed', 'cancelled', 'completed')),
  notes                text,
  created_by           uuid not null references auth.users (id),
  updated_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists ferries_company_id_idx on public.ferries (company_id);
create index if not exists ferries_arrival_time_idx on public.ferries (arrival_time);
create index if not exists planned_discharges_company_id_idx on public.planned_discharges (company_id);
create index if not exists planned_discharges_date_idx on public.planned_discharges (discharge_date);
create index if not exists planned_discharges_status_idx on public.planned_discharges (status);

alter table public.ferries enable row level security;
alter table public.planned_discharges enable row level security;

-- Compatibility alias for clients querying the misspelled table name.
drop view if exists public.ferrys;
create view public.ferrys as
select * from public.ferries;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ferries' AND policyname = 'ferries_read_public'
  ) THEN
    CREATE POLICY "ferries_read_public"
      ON public.ferries FOR SELECT
      USING (auth.role() = 'authenticated' AND is_private = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ferries' AND policyname = 'ferries_read_own_private'
  ) THEN
    CREATE POLICY "ferries_read_own_private"
      ON public.ferries FOR SELECT
      USING (auth.role() = 'authenticated' AND is_private = true AND company_id = public.current_user_company());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ferries' AND policyname = 'ferries_insert_own_company'
  ) THEN
    CREATE POLICY "ferries_insert_own_company"
      ON public.ferries FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND company_id = public.current_user_company());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'planned_discharges' AND policyname = 'planned_discharges_read_all'
  ) THEN
    CREATE POLICY "planned_discharges_read_all"
      ON public.planned_discharges FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'planned_discharges' AND policyname = 'planned_discharges_insert_own_company'
  ) THEN
    CREATE POLICY "planned_discharges_insert_own_company"
      ON public.planned_discharges FOR INSERT
      WITH CHECK (auth.role() = 'authenticated' AND company_id = public.current_user_company());
  END IF;
END
$$;
