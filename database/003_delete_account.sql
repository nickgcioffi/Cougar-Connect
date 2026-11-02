-- Transactionally remove application data after the Express server has
-- authenticated the requester and removed their files through the Storage API.
begin;

create or replace function public.purge_account_data(target_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id bigint;
begin
  if target_auth_user_id is null then
    raise exception 'A user ID is required';
  end if;

  select "userID" into profile_id
  from public."User"
  where "authUserID" = target_auth_user_id
  for update;

  if profile_id is not null then
    delete from public."User Interests" where "UserID" = profile_id;
    delete from public."UserEvents" where "userID" = profile_id;
    delete from public."User" where "userID" = profile_id;
  end if;

  delete from public."Organization Admins"
  where "authUserID" = target_auth_user_id;
end
$$;

revoke all on function public.purge_account_data(uuid)
from public, anon, authenticated;
grant execute on function public.purge_account_data(uuid) to service_role;

commit;
