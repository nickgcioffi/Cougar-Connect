-- Apply before verifying signup and profile edits.
begin;

create or replace function public.save_profile(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare fullname text:=trim(payload->>'name');
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if coalesce(fullname,'')='' or length(fullname)>80 or coalesce(payload->>'uni','')='' or payload->>'level' not in ('Undergraduate','Graduate') or length(coalesce(payload->>'bio',''))>400 then raise exception 'Invalid profile'; end if;
 insert into public."User"("authUserID","firstName","lastName","uniName","gradDate",biography,"photoURL","studyLevel")
 values(auth.uid(),split_part(fullname,' ',1),trim(substr(fullname,length(split_part(fullname,' ',1))+1)),payload->>'uni',((payload->>'graduation')||'-01')::date,payload->>'bio',payload->>'photo',payload->>'level')
 on conflict("authUserID") do update set "firstName"=excluded."firstName","lastName"=excluded."lastName","uniName"=excluded."uniName","gradDate"=excluded."gradDate",biography=excluded.biography,"photoURL"=excluded."photoURL","studyLevel"=excluded."studyLevel";
end $$;

commit;
