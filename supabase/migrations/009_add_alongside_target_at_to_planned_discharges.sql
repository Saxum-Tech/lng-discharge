-- Backfill missing planning time column expected by portal calendar clients.

alter table public.planned_discharges
  add column if not exists alongside_target_at time not null default '23:00';

update public.planned_discharges
set alongside_target_at = coalesce(alongside_target_at, discharge_time, '23:00'::time)
where alongside_target_at is distinct from coalesce(alongside_target_at, discharge_time, '23:00'::time);
