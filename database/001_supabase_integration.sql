-- Run after the existing tables supplied for this project.
begin;
alter table public."User" add column if not exists "authUserID" uuid unique references auth.users(id) on delete cascade;
alter table public."User" add column if not exists "studyLevel" text not null default 'Undergraduate';
alter table public."User" add column if not exists "primaryInterest" text;
alter table public."User" add column if not exists "launchPreference" text not null default 'Home';
create table if not exists public."Organization Admins" (
 "authUserID" uuid references auth.users(id) on delete cascade,
 "orgID" bigint references public."Organization"("orgID") on delete cascade,
 primary key ("authUserID", "orgID")
);
insert into public."Interest" (name) select seed.name from unnest(array['Career & networking','Technology','Entrepreneurship','Service','Arts & culture','Sports & outdoors','Research','Social & community']) as seed(name) where not exists(select 1 from public."Interest" i where i.name=seed.name);
create or replace function public.owns_profile(uid bigint) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public."User" where "userID"=uid and "authUserID"=auth.uid()) $$;
create or replace function public.administers(oid bigint) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public."Organization Admins" where "orgID"=oid and "authUserID"=auth.uid()) $$;
alter table public."User" enable row level security;
alter table public."Interest" enable row level security;
alter table public."Organization" enable row level security;
alter table public."Events" enable row level security;
alter table public."User Interests" enable row level security;
alter table public."Event Interests" enable row level security;
alter table public."UserEvents" enable row level security;
alter table public."Event Co-Hosts" enable row level security;
alter table public."Organization Admins" enable row level security;
create policy profile_read on public."User" for select to authenticated using ("authUserID"=auth.uid());
create policy interests_read on public."Interest" for select to authenticated using (true);
create policy organizations_read on public."Organization" for select to authenticated using (true);
create policy events_read on public."Events" for select to authenticated using (true);
create policy chosen_read on public."User Interests" for select to authenticated using(public.owns_profile("UserID"));
create policy saved_read on public."UserEvents" for select to authenticated using(public.owns_profile("userID"));
create policy genres_read on public."Event Interests" for select to authenticated using(true);
create policy cohosts_read on public."Event Co-Hosts" for select to authenticated using(true);
create policy admins_read on public."Organization Admins" for select to authenticated using("authUserID"=auth.uid());
-- Writes are atomic RPCs. Direct client writes, including admin assignment, are revoked.
revoke all on public."User",public."Interest",public."Organization",public."Events",public."User Interests",public."Event Interests",public."UserEvents",public."Event Co-Hosts",public."Organization Admins" from anon,authenticated;
grant select on public."User",public."Interest",public."Organization",public."Events",public."User Interests",public."Event Interests",public."UserEvents",public."Event Co-Hosts",public."Organization Admins" to authenticated;
create or replace function public.save_profile(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare fullname text:=trim(payload->>'name');
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if coalesce(fullname,'')='' or length(fullname)>80 or coalesce(payload->>'uni','')='' or payload->>'level' not in ('Undergraduate','Graduate') or length(coalesce(payload->>'bio',''))>400 then raise exception 'Invalid profile'; end if;
 insert into public."User"("authUserID","firstName","lastName","uniName","gradDate",biography,"photoURL","studyLevel","primaryInterest")
 values(auth.uid(),split_part(fullname,' ',1),trim(substr(fullname,length(split_part(fullname,' ',1))+1)),payload->>'uni',((payload->>'graduation')||'-01')::date,payload->>'bio',payload->>'photo',payload->>'level',payload->>'interest')
 on conflict("authUserID") do update set "firstName"=excluded."firstName","lastName"=excluded."lastName","uniName"=excluded."uniName","gradDate"=excluded."gradDate",biography=excluded.biography,"photoURL"=excluded."photoURL","studyLevel"=excluded."studyLevel","primaryInterest"=excluded."primaryInterest";
end $$;
create or replace function public.save_interests(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid bigint;
begin
 select "userID" into uid from public."User" where "authUserID"=auth.uid();
 if uid is null then raise exception 'Create a profile first'; end if;
 if (select count(distinct i.name) from public."Interest" i join jsonb_array_elements_text(payload) p on i.name=p.value)<3 then raise exception 'Choose at least three interests'; end if;
 delete from public."User Interests" where "UserID"=uid;
 insert into public."User Interests" select distinct "interestID",uid from public."Interest" where name in(select jsonb_array_elements_text(payload));
end $$;
create or replace function public.save_launch(payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if payload->>'launch' not in ('Home','Calendar','Search','Feed','Settings') then raise exception 'Invalid launch preference'; end if;
 update public."User" set "launchPreference"=payload->>'launch' where "authUserID"=auth.uid();
 if not found then raise exception 'Create a profile first'; end if;
end $$;
create or replace function public.save_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid bigint;
begin
 select "userID" into uid from public."User" where "authUserID"=auth.uid();
 if uid is null then raise exception 'Create a profile first'; end if;
 insert into public."UserEvents" values(uid,(payload->>'id')::bigint,(payload->>'saved')::boolean) on conflict("userID","eventID") do update set "isSaved"=excluded."isSaved";
end $$;
create or replace function public.create_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare eid bigint; iid bigint; oid bigint:=(payload->>'orgID')::bigint;
begin
 if not public.administers(oid) then raise exception 'Club admin access required'; end if;
 if coalesce(trim(payload->>'name'),'')='' or coalesce(trim(payload->>'location'),'')='' or coalesce(trim(payload->>'desc'),'')='' or payload->>'type' not in ('Professional','Social') then raise exception 'Complete all event fields'; end if;
 if ((payload->>'date')::date + (payload->>'time')::time) at time zone 'America/Denver' <= now() then raise exception 'Choose a future date and time'; end if;
 select "interestID" into iid from public."Interest" where name=payload->>'genre' limit 1;
 if iid is null then raise exception 'Invalid interest'; end if;
 insert into public."Events"(name,type,time,location,description,date,"orgID") values(payload->>'name',payload->>'type',(payload->>'time')::time,payload->>'location',payload->>'desc',(payload->>'date')::date,oid) returning "eventID" into eid;
 insert into public."Event Interests" values(iid,eid);
end $$;
create or replace function public.cancel_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare eid bigint:=(payload->>'id')::bigint; oid bigint;
begin
 select "orgID" into oid from public."Events" where "eventID"=eid for update;
 if oid is null or not public.administers(oid) then raise exception 'Club admin access required'; end if;
 delete from public."UserEvents" where "eventID"=eid;
 delete from public."Event Interests" where "eventID"=eid;
 delete from public."Event Co-Hosts" where "eventID"=eid;
 delete from public."Events" where "eventID"=eid;
end $$;
revoke all on function public.save_profile(jsonb),public.save_interests(jsonb),public.save_launch(jsonb),public.save_event(jsonb),public.create_event(jsonb),public.cancel_event(jsonb),public.owns_profile(bigint),public.administers(bigint) from public,anon;
grant execute on function public.save_profile(jsonb),public.save_interests(jsonb),public.save_launch(jsonb),public.save_event(jsonb),public.create_event(jsonb),public.cancel_event(jsonb),public.owns_profile(bigint),public.administers(bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',true,2000000,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy photo_insert on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy photo_update on storage.objects for update to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
