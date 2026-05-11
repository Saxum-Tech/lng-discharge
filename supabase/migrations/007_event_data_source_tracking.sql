-- Track where schedule/event records originated for admin auditing.

DO $$
BEGIN
  IF to_regclass('public.flights') IS NOT NULL THEN
    ALTER TABLE public.flights
      ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual_ui';
    COMMENT ON COLUMN public.flights.data_source IS 'Origin of record: manual_ui, website_sync, api_sync, import, etc.';
  END IF;

  IF to_regclass('public.cruise_schedules') IS NOT NULL THEN
    ALTER TABLE public.cruise_schedules
      ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual_ui';
    COMMENT ON COLUMN public.cruise_schedules.data_source IS 'Origin of record: manual_ui, website_sync, api_sync, import, etc.';
  END IF;

  IF to_regclass('public.ferries') IS NOT NULL THEN
    ALTER TABLE public.ferries
      ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual_ui';
    COMMENT ON COLUMN public.ferries.data_source IS 'Origin of record: manual_ui, website_sync, api_sync, import, etc.';
  END IF;

  IF to_regclass('public.operational_events') IS NOT NULL THEN
    ALTER TABLE public.operational_events
      ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'manual_ui';
    COMMENT ON COLUMN public.operational_events.data_source IS 'Origin of record: manual_ui, website_sync, api_sync, import, etc.';
  END IF;
END
$$;
