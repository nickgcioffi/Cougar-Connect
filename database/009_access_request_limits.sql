-- Run after 007–008. Quota is shared across server processes and concurrent requests.
begin;
create index if not exists access_requests_applicant_created on public."Organization Access Requests"("authUserID","createdAt");
create or replace function public.submit_access_request(applicant_id uuid, request_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare used integer; rid bigint; start_of_day timestamptz; end_of_day timestamptz;
begin
 if applicant_id is null then raise exception 'Applicant required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('access-request:'||applicant_id::text,0));
 start_of_day:=date_trunc('day',now() at time zone 'America/Denver') at time zone 'America/Denver';
 end_of_day:=(date_trunc('day',now() at time zone 'America/Denver')+interval '1 day') at time zone 'America/Denver';
 select count(*) into used from public."Organization Access Requests" where "authUserID"=applicant_id and "createdAt">=start_of_day and "createdAt"<end_of_day;
 if used>=3 then raise exception 'Daily request limit reached' using errcode='P0429'; end if;
 insert into public."Organization Access Requests"("authUserID","firstName","lastName",email,organization,position,reason,status)
 values(applicant_id,request_payload->>'firstName',request_payload->>'lastName',request_payload->>'email',request_payload->>'organization',request_payload->>'position',request_payload->>'reason','Pending') returning "requestID" into rid;
 return jsonb_build_object('requestID',rid,'remaining',2-used);
end $$;
revoke all on function public.submit_access_request(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_access_request(uuid,jsonb) to service_role;
commit;
