-- Apply only after deploying the app update and verifying signup and profile edits.
begin;

do $$
begin
  if strpos(pg_get_functiondef('public.save_profile(jsonb)'::regprocedure), '"primaryInterest"') > 0 then
    raise exception 'Apply 004_remove_primary_interest_from_profile_save.sql first';
  end if;
end $$;

alter table public."User" drop column if exists "primaryInterest" restrict;

commit;
