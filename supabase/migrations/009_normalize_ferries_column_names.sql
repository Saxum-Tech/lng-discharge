-- Normalize ferry column names across environments.
-- Some environments were created with vessel_name/operator_name while app code expects ferry_name/service_route.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ferries' AND column_name = 'vessel_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ferries' AND column_name = 'ferry_name'
  ) THEN
    ALTER TABLE public.ferries ADD COLUMN ferry_name text;
    UPDATE public.ferries SET ferry_name = vessel_name WHERE ferry_name IS NULL;
    ALTER TABLE public.ferries ALTER COLUMN ferry_name SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ferries' AND column_name = 'operator_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ferries' AND column_name = 'service_route'
  ) THEN
    ALTER TABLE public.ferries ADD COLUMN service_route text;
    UPDATE public.ferries SET service_route = operator_name WHERE service_route IS NULL;
  END IF;
END
$$;
