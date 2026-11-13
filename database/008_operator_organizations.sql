-- Run after 007. Operators can create organizations without granting access.
begin;
create or replace function public.create_organization(organization_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cleaned text:=trim(regexp_replace(organization_name,'[[:space:]]+',' ','g')); oid bigint; existing_name text; created boolean:=false;
begin
 if not public.is_operator() then raise exception 'Operator access required' using errcode='42501'; end if;
 if cleaned is null or length(cleaned)=0 or length(cleaned)>150 then raise exception 'Enter an organization name of 1–150 characters' using errcode='22023'; end if;
 -- Serialize matching names so concurrent submissions cannot create duplicates.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(cleaned),0));
 select "orgID","orgName" into oid,existing_name from public."Organization"
 where lower(trim(regexp_replace("orgName",'[[:space:]]+',' ','g')))=lower(cleaned)
 order by "orgID" limit 1;
 if oid is null then
  insert into public."Organization"("orgName") values(cleaned) returning "orgID","orgName" into oid,existing_name;
  created:=true;
 end if;
 return jsonb_build_object('organization',jsonb_build_object('id',oid,'name',existing_name),'created',created);
end $$;
revoke all on function public.create_organization(text) from public,anon,authenticated;
grant execute on function public.create_organization(text) to authenticated;
commit;
