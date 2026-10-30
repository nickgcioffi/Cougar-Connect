-- Temporary coursework policy: any authenticated user may create or cancel events.
-- Replace these functions when the dedicated administrator login is implemented.
begin;

create or replace function public.create_event(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare eid bigint; iid bigint; oid bigint:=(payload->>'orgID')::bigint;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if coalesce(trim(payload->>'name'),'')='' or coalesce(trim(payload->>'location'),'')='' or coalesce(trim(payload->>'desc'),'')='' or payload->>'type' not in ('Professional','Social') then raise exception 'Complete all event fields'; end if;
 if ((payload->>'date')::date + (payload->>'time')::time) at time zone 'America/Denver' <= now() then raise exception 'Choose a future date and time'; end if;
 select "interestID" into iid from public."Interest" where name=payload->>'genre' limit 1;
 if iid is null then raise exception 'Invalid interest'; end if;
 if not exists(select 1 from public."Organization" where "orgID"=oid) then raise exception 'Invalid organization'; end if;
 insert into public."Events"(name,type,time,location,description,date,"orgID") values(payload->>'name',payload->>'type',(payload->>'time')::time,payload->>'location',payload->>'desc',(payload->>'date')::date,oid) returning "eventID" into eid;
 insert into public."Event Interests" values(iid,eid);
end $$;

create or replace function public.cancel_event(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare eid bigint:=(payload->>'id')::bigint;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not exists(select 1 from public."Events" where "eventID"=eid) then raise exception 'Event not found'; end if;
 delete from public."UserEvents" where "eventID"=eid;
 delete from public."Event Interests" where "eventID"=eid;
 delete from public."Event Co-Hosts" where "eventID"=eid;
 delete from public."Events" where "eventID"=eid;
end $$;

revoke all on function public.create_event(jsonb),public.cancel_event(jsonb) from public,anon;
grant execute on function public.create_event(jsonb),public.cancel_event(jsonb) to authenticated;

commit;
