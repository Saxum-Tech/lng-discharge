-- Avoid recursive RLS evaluation when policies call helper functions that query profiles.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles as p
  where p.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_company()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles as p
  where p.user_id = auth.uid()
  limit 1;
$$;
