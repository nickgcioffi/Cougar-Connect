-- Replace the retired launch-screen preference with the logo destination.
begin;
alter table public."User" alter column "launchPreference" set default '/';
update public."User" set "launchPreference" = '/'
where "launchPreference" not in ('/', '/home');

create or replace function public.save_launch(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if payload->>'launch' is null or payload->>'launch' not in ('/', '/home') then
    raise exception 'Invalid logo destination';
  end if;
  update public."User" set "launchPreference" = payload->>'launch'
  where "authUserID" = auth.uid();
  if not found then raise exception 'Create a profile first'; end if;
end $$;
commit;
