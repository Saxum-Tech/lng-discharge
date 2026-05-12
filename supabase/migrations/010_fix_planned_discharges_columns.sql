-- Backfill planned_discharges schema for environments created from compatibility migration.
alter table if exists public.planned_discharges
  add column if not exists approx_quantity_m3 numeric(12,2);

alter table if exists public.planned_discharges
  add column if not exists alongside_target_at timestamptz;

-- Keep legacy lng_volume_m3 data if present.
update public.planned_discharges
set approx_quantity_m3 = lng_volume_m3
where approx_quantity_m3 is null
  and lng_volume_m3 is not null;
