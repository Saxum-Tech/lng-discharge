-- Adds ferries, operational events and planned discharge planning with audit triggers.

-- ─── Ferries ────────────────────────────────────────────────────────────────
create table if not exists public.ferries (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  ferry_name      text not null,
  service_route   text,
  arrival_time    timestamptz not null,
  departure_time  timestamptz,
  is_private      boolean not null default false,
  notes           text,
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Operational events ─────────────────────────────────────────────────────
create table if not exists public.operational_events (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  event_type        text not null default 'other'
                     check (event_type in ('private_flight', 'ferry', 'port_constraint', 'other')),
  title             text not null,
  start_time        timestamptz not null,
  end_time          timestamptz,
  blocks_discharge  boolean not null default true,
  is_private        boolean not null default false,
  notes             text,
  created_by        uuid not null references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── Planned discharges ─────────────────────────────────────────────────────
create table if not exists public.planned_discharges (
  id                   uuid primary key default uuid_generate_v4(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  discharge_date       date not null,
  alongside_target_at  time not null default '23:00',
  vessel_name          text not null,
  approx_quantity_m3   numeric(12, 2) not null check (approx_quantity_m3 >= 0),
  status               text not null default 'planned'
                        check (status in ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes                text,
  created_by           uuid not null references auth.users (id),
  updated_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists ferries_company_id_idx on public.ferries (company_id);
create index if not exists ferries_arrival_time_idx on public.ferries (arrival_time);
create index if not exists operational_events_company_id_idx on public.operational_events (company_id);
create index if not exists operational_events_start_time_idx on public.operational_events (start_time);
create index if not exists planned_discharges_company_id_idx on public.planned_discharges (company_id);
create index if not exists planned_discharges_date_idx on public.planned_discharges (discharge_date);
create index if not exists planned_discharges_status_idx on public.planned_discharges (status);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.ferries enable row level security;
alter table public.operational_events enable row level security;
alter table public.planned_discharges enable row level security;

-- ferries: public/private split + own-company writes + superadmin override
create policy "ferries_read_public"
  on public.ferries for select
  using (auth.role() = 'authenticated' and is_private = false);

create policy "ferries_read_own_private"
  on public.ferries for select
  using (
    auth.role() = 'authenticated'
    and is_private = true
    and company_id = public.current_user_company()
  );

create policy "ferries_insert_own_company"
  on public.ferries for insert
  with check (
    auth.role() = 'authenticated'
    and company_id = public.current_user_company()
  );

create policy "ferries_update_own_company"
  on public.ferries for update
  using (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create policy "ferries_delete_own_company"
  on public.ferries for delete
  using (company_id = public.current_user_company());

create policy "ferries_superadmin_all"
  on public.ferries for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- operational_events: public/private split + own-company writes + superadmin override
create policy "operational_events_read_public"
  on public.operational_events for select
  using (auth.role() = 'authenticated' and is_private = false);

create policy "operational_events_read_own_private"
  on public.operational_events for select
  using (
    auth.role() = 'authenticated'
    and is_private = true
    and company_id = public.current_user_company()
  );

create policy "operational_events_insert_own_company"
  on public.operational_events for insert
  with check (
    auth.role() = 'authenticated'
    and company_id = public.current_user_company()
  );

create policy "operational_events_update_own_company"
  on public.operational_events for update
  using (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create policy "operational_events_delete_own_company"
  on public.operational_events for delete
  using (company_id = public.current_user_company());

create policy "operational_events_superadmin_all"
  on public.operational_events for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- planned_discharges: visible to all authenticated, writable only by own company + superadmin
create policy "planned_discharges_read_all"
  on public.planned_discharges for select
  using (auth.role() = 'authenticated');

create policy "planned_discharges_insert_own_company"
  on public.planned_discharges for insert
  with check (
    auth.role() = 'authenticated'
    and company_id = public.current_user_company()
  );

create policy "planned_discharges_update_own_company"
  on public.planned_discharges for update
  using (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create policy "planned_discharges_delete_own_company"
  on public.planned_discharges for delete
  using (company_id = public.current_user_company());

create policy "planned_discharges_superadmin_all"
  on public.planned_discharges for all
  using (public.current_user_role() = 'superadmin')
  with check (public.current_user_role() = 'superadmin');

-- ─── Triggers (updated_at / metadata) ───────────────────────────────────────
create trigger ferries_updated_at before update on public.ferries
  for each row execute function public.set_updated_at();

create trigger operational_events_updated_at before update on public.operational_events
  for each row execute function public.set_updated_at();

create or replace function public.set_planned_discharge_updated_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger planned_discharges_updated_meta before update on public.planned_discharges
  for each row execute function public.set_planned_discharge_updated_meta();

-- ─── Automatic audit logging for critical planning/event tables ─────────────
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  action_name text;
  rec_id uuid;
begin
  actor := auth.uid();

  if TG_OP = 'INSERT' then
    action_name := TG_TABLE_NAME || '_created';
    rec_id := new.id;
    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor, action_name, TG_TABLE_NAME, rec_id, null, to_jsonb(new));
    return new;
  elsif TG_OP = 'UPDATE' then
    action_name := TG_TABLE_NAME || '_updated';
    rec_id := new.id;
    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor, action_name, TG_TABLE_NAME, rec_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif TG_OP = 'DELETE' then
    action_name := TG_TABLE_NAME || '_deleted';
    rec_id := old.id;
    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor, action_name, TG_TABLE_NAME, rec_id, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists flights_audit_row_change on public.flights;
create trigger flights_audit_row_change
after insert or update or delete on public.flights
for each row execute function public.audit_row_change();

drop trigger if exists cruise_schedules_audit_row_change on public.cruise_schedules;
create trigger cruise_schedules_audit_row_change
after insert or update or delete on public.cruise_schedules
for each row execute function public.audit_row_change();

drop trigger if exists ferries_audit_row_change on public.ferries;
create trigger ferries_audit_row_change
after insert or update or delete on public.ferries
for each row execute function public.audit_row_change();

drop trigger if exists operational_events_audit_row_change on public.operational_events;
create trigger operational_events_audit_row_change
after insert or update or delete on public.operational_events
for each row execute function public.audit_row_change();

drop trigger if exists planned_discharges_audit_row_change on public.planned_discharges;
create trigger planned_discharges_audit_row_change
after insert or update or delete on public.planned_discharges
for each row execute function public.audit_row_change();
