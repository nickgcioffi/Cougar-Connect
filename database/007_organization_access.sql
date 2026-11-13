begin;
alter table public."User" add column if not exists role text not null default 'user' check (role in ('user','organization_admin','operator'));
create table if not exists public."Organization Access Requests" (
 "requestID" bigint generated always as identity primary key,
 "firstName" text not null, "lastName" text not null, email text not null,
 organization text not null, position text not null, reason text not null,
 status text not null default 'Pending', "reviewedBy" uuid references auth.users(id) on delete set null,
 "createdAt" timestamptz not null default now()
);
alter table public."Organization Access Requests"
 add column if not exists "authUserID" uuid references auth.users(id) on delete cascade,
 add column if not exists "orgID" bigint references public."Organization"("orgID"),
 add column if not exists "aiRecommendation" text,
 add column if not exists "aiRationale" text,
 add column if not exists "reviewedAt" timestamptz;
-- Preserve audit rows when a reviewer deletes their account.
alter table public."Organization Access Requests" drop constraint if exists "Organization Access Requests_reviewedBy_fkey";
alter table public."Organization Access Requests" add constraint "Organization Access Requests_reviewedBy_fkey" foreign key ("reviewedBy") references auth.users(id) on delete set null;
-- Normalize the legacy request status names before enforcing the new vocabulary.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public."Organization Access Requests"'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%' loop
 execute format('alter table public."Organization Access Requests" drop constraint %I',c.conname);
 end loop;
end $$;
update public."Organization Access Requests" set status=case status when 'Denied' then 'Rejected' when 'Pended' then 'Needs Review' else status end;
alter table public."Organization Access Requests" alter column status set default 'Pending';
alter table public."Organization Access Requests" add constraint access_request_status check(status in ('Pending','Needs Review','Approved','Rejected'));
create or replace function public.is_operator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public."User" where "authUserID"=auth.uid() and role='operator')
$$;
create or replace function public.administers(oid bigint) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_operator() or exists(select 1 from public."Organization Admins" a join public."User" u on u."authUserID"=a."authUserID" where a."authUserID"=auth.uid() and a."orgID"=oid and u.role='organization_admin')
$$;
-- Preserve existing explicit assignments when introducing roles.
update public."User" u set role='organization_admin' where role='user' and exists(select 1 from public."Organization Admins" a where a."authUserID"=u."authUserID");
alter table public."Organization Access Requests" enable row level security;
drop policy if exists access_requests_read on public."Organization Access Requests";
create policy access_requests_read on public."Organization Access Requests" for select to authenticated using("authUserID"=auth.uid() or public.is_operator());
revoke all on public."Organization Access Requests" from anon, authenticated;
grant select on public."Organization Access Requests" to authenticated;
grant all on public."Organization Access Requests" to service_role;
grant usage,select on sequence public."Organization Access Requests_requestID_seq" to service_role;
-- No direct client writes to role or membership: approval happens atomically below.
revoke insert,update,delete on public."User",public."Organization Admins" from anon,authenticated;
create or replace function public.decide_access_request(target_request_id bigint, decision text, target_org_id bigint default null)
returns public."Organization Access Requests" language plpgsql security definer set search_path='' as $$
declare r public."Organization Access Requests";
begin
 if not public.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if decision is null or decision not in ('Approved','Rejected') then raise exception 'Choose approval or rejection' using errcode='22023'; end if;
 select * into r from public."Organization Access Requests" where "requestID"=target_request_id for update;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
 if r.status not in ('Pending','Needs Review') then raise exception 'Request already reviewed' using errcode='23505'; end if;
 if decision='Approved' then
  if r."authUserID" is null then raise exception 'Applicant must submit from a signed-in account' using errcode='22023'; end if;
  perform 1 from public."User" where "authUserID"=r."authUserID" for update;
  if not found then raise exception 'Applicant must create a profile first' using errcode='22023'; end if;
  if target_org_id is null or not exists(select 1 from public."Organization" where "orgID"=target_org_id) then raise exception 'Select a valid organization' using errcode='22023'; end if;
  insert into public."Organization Admins"("authUserID","orgID") values(r."authUserID",target_org_id) on conflict do nothing;
  update public."User" set role=case when role='operator' then role else 'organization_admin' end where "authUserID"=r."authUserID";
 end if;
 update public."Organization Access Requests" set status=decision,"orgID"=case when decision='Approved' then target_org_id else null end,"reviewedBy"=auth.uid(),"reviewedAt"=now() where "requestID"=target_request_id returning * into r;
 return r;
end $$;
create or replace function public.revoke_organization_access(target_user_id uuid,target_org_id bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 perform 1 from public."User" where "authUserID"=target_user_id for update;
 delete from public."Organization Admins" where "authUserID"=target_user_id and "orgID"=target_org_id;
 update public."User" set role='user' where "authUserID"=target_user_id and role='organization_admin' and not exists(select 1 from public."Organization Admins" where "authUserID"=target_user_id);
end $$;
-- Replace the temporary open event mutations from migration 002.
create or replace function public.write_managed_event(payload jsonb, editing boolean) returns void language plpgsql security definer set search_path='' as $$
declare oid bigint:=(payload->>'orgID')::bigint; eid bigint; iid bigint; existing_oid bigint;
begin
 if editing then
  eid:=(payload->>'id')::bigint;
  select "orgID" into existing_oid from public."Events" where "eventID"=eid for update;
  if existing_oid is null then raise exception 'Event not found' using errcode='22023'; end if;
  if not public.administers(existing_oid) then raise exception 'Organization access required' using errcode='42501'; end if;
 end if;
 if auth.uid() is null or not public.administers(oid) then raise exception 'Organization access required' using errcode='42501'; end if;
 if coalesce(trim(payload->>'name'),'')='' or coalesce(trim(payload->>'location'),'')='' or coalesce(trim(payload->>'desc'),'')='' or payload->>'type' is null or payload->>'type' not in ('Professional','Social') then raise exception 'Complete all event fields' using errcode='22023'; end if;
 if ((payload->>'date')::date+(payload->>'time')::time) at time zone 'America/Denver' <= now() then raise exception 'Choose a future date and time' using errcode='22023'; end if;
 select "interestID" into iid from public."Interest" where name=payload->>'genre' limit 1;
 if iid is null then raise exception 'Invalid interest' using errcode='22023'; end if;
 if nullif(payload->>'endTime','')::time <= (payload->>'time')::time then raise exception 'End time must follow start time' using errcode='22023'; end if;
 if editing then
  update public."Events" set name=payload->>'name',type=payload->>'type',time=(payload->>'time')::time,"endTime"=nullif(payload->>'endTime','')::time,location=payload->>'location',description=payload->>'desc',date=(payload->>'date')::date,"orgID"=oid where "eventID"=eid;
  delete from public."Event Interests" where "eventID"=eid;
 else
  insert into public."Events"(name,type,time,"endTime",location,description,date,"orgID") values(payload->>'name',payload->>'type',(payload->>'time')::time,nullif(payload->>'endTime','')::time,payload->>'location',payload->>'desc',(payload->>'date')::date,oid) returning "eventID" into eid;
 end if;
 insert into public."Event Interests" values(iid,eid);
end $$;
create or replace function public.create_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin perform public.write_managed_event(payload,false); end $$;
create or replace function public.update_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin perform public.write_managed_event(payload,true); end $$;
create or replace function public.cancel_event(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare eid bigint:=(payload->>'id')::bigint; oid bigint;
begin
 select "orgID" into oid from public."Events" where "eventID"=eid for update;
 if auth.uid() is null or not public.administers(oid) then raise exception 'Organization access required' using errcode='42501'; end if;
 if to_regclass('public."Event Reviews"') is not null then execute 'delete from public."Event Reviews" where "eventID"=$1' using eid; end if;
 delete from public."UserEvents" where "eventID"=eid;
 delete from public."Event Interests" where "eventID"=eid;
 delete from public."Event Co-Hosts" where "eventID"=eid;
 delete from public."Events" where "eventID"=eid;
end $$;
alter table public."Events" add column if not exists "endTime" time;
revoke all on function public.is_operator(),public.decide_access_request(bigint,text,bigint),public.revoke_organization_access(uuid,bigint),public.write_managed_event(jsonb,boolean),public.update_event(jsonb) from public,anon,authenticated;
grant execute on function public.is_operator(),public.decide_access_request(bigint,text,bigint),public.revoke_organization_access(uuid,bigint),public.update_event(jsonb) to authenticated;
commit;
