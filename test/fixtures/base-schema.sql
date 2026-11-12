-- Minimal pre-existing coursework schema required by migrations 001–006.
-- Supabase auth/storage interfaces are reproduced locally for SQL contract tests.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table public."User"("userID" bigint generated always as identity primary key,"firstName" text,"lastName" text,"uniName" text,"gradDate" date,biography text,"photoURL" text);
create table public."Interest"("interestID" bigint generated always as identity primary key,name text unique);
create table public."Organization"("orgID" bigint generated always as identity primary key,"orgName" text);
create table public."Events"("eventID" bigint generated always as identity primary key,name text,type text,time time,location text,description text,date date,"orgID" bigint references public."Organization");
create table public."User Interests"("interestID" bigint references public."Interest","UserID" bigint references public."User",primary key("interestID","UserID"));
create table public."Event Interests"("interestID" bigint references public."Interest","eventID" bigint references public."Events",primary key("interestID","eventID"));
create table public."UserEvents"("userID" bigint references public."User","eventID" bigint references public."Events","isSaved" boolean,primary key("userID","eventID"));
create table public."Event Co-Hosts"("orgID" bigint references public."Organization","eventID" bigint references public."Events");
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text references storage.buckets,name text);
alter table storage.objects enable row level security;
grant select,insert,update on storage.objects to authenticated;
grant usage on sequence storage.objects_id_seq to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
