-- Record all user/system data changes for operational auditing.
create or replace function public.log_audit_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  action_name text := lower(tg_op);
  target_id uuid;
begin
  if tg_op = 'INSERT' then
    target_id := new.id;

    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor_id, action_name, tg_table_name, target_id, null, to_jsonb(new));

    return new;
  elsif tg_op = 'UPDATE' then
    target_id := coalesce(new.id, old.id);

    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor_id, action_name, tg_table_name, target_id, to_jsonb(old), to_jsonb(new));

    return new;
  elsif tg_op = 'DELETE' then
    target_id := old.id;

    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (actor_id, action_name, tg_table_name, target_id, to_jsonb(old), null);

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists app_settings_audit_log on public.app_settings;
create trigger app_settings_audit_log
  after insert or update or delete on public.app_settings
  for each row execute function public.log_audit_activity();

drop trigger if exists companies_audit_log on public.companies;
create trigger companies_audit_log
  after insert or update or delete on public.companies
  for each row execute function public.log_audit_activity();

drop trigger if exists profiles_audit_log on public.profiles;
create trigger profiles_audit_log
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit_activity();

drop trigger if exists flights_audit_log on public.flights;
create trigger flights_audit_log
  after insert or update or delete on public.flights
  for each row execute function public.log_audit_activity();

drop trigger if exists cruise_schedules_audit_log on public.cruise_schedules;
create trigger cruise_schedules_audit_log
  after insert or update or delete on public.cruise_schedules
  for each row execute function public.log_audit_activity();
