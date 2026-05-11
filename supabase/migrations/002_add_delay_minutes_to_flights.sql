-- Add delay tracking field used by public-data sync and portal views.
alter table public.flights
add column if not exists delay_minutes integer;
