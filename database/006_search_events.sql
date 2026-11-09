-- Run once in the Supabase SQL Editor after migrations 001–005.
-- SECURITY INVOKER preserves the signed-in user's row-level security policies.
create or replace function public.search_events(search_term text)
returns setof public."Events"
language sql stable security invoker set search_path = ''
as $$
  select e.*
  from public."Events" e
  where auth.uid() is not null
    and length(btrim(search_term)) between 1 and 100
    and (
      strpos(lower(coalesce(e.name, '')), lower(btrim(search_term))) > 0
      or strpos(lower(coalesce(e.location, '')), lower(btrim(search_term))) > 0
      or exists (
        select 1 from public."Organization" o
        where o."orgID" = e."orgID"
          and strpos(lower(o."orgName"), lower(btrim(search_term))) > 0
      )
      or exists (
        select 1 from public."Event Interests" ei
        join public."Interest" i on i."interestID" = ei."interestID"
        where ei."eventID" = e."eventID"
          and strpos(lower(i.name), lower(btrim(search_term))) > 0
      )
    )
  order by e.date, e.time, e."eventID"
  limit 8;
$$;
revoke all on function public.search_events(text) from public, anon;
grant execute on function public.search_events(text) to authenticated;
