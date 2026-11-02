# Account deletion setup

Account deletion is handled by the Express server. The browser sends only its
normal user access token; it never receives a Supabase secret or service-role
key.

## One-time Supabase setup

1. In the Supabase SQL Editor, run `database/003_delete_account.sql` after
   `database/001_supabase_integration.sql`. The function can only be called by
   `service_role`; `anon` and `authenticated` are explicitly denied.
2. In Project Settings → API Keys, copy the project's server-side secret key
   (`sb_secret_...`). Legacy projects may use the `service_role` key instead.
3. Set `SUPABASE_SECRET_KEY` in the Express server's private environment and
   restart the server. For a legacy key, set `SUPABASE_SERVICE_ROLE_KEY`.
   Never put either value in frontend code, `/api/config`, Git, or a public
   deployment variable.

No new Storage policy is needed for deletion. The server uses the Storage API
with its server-only credential and deletes only the folder named with the
authenticated user's UUID.

## Failure behavior

Deletion runs in this order: Storage files, application records, Auth user.
The application-record purge is a single database transaction. A Storage
failure stops the operation before database changes. If the later Auth Admin
call fails, the user can retry: the file and record cleanup is idempotent, and
the Auth account remains available until that final call succeeds.

The repository ERD has two tables that reference `User.userID` (`User
Interests` and `UserEvents`) and one table that references the Auth UUID
(`Organization Admins`). The migration explicitly deletes those dependencies
before deleting `User`. If the deployed database has acquired additional
foreign keys that are not represented in the repository, inspect them before
deployment with:

```sql
select
  conrelid::regclass as referencing_table,
  conname as constraint_name,
  confrelid::regclass as referenced_table,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid in ('public."User"'::regclass, 'auth.users'::regclass)
order by 3, 1;
```

Any additional user-owned rows must either use `ON DELETE CASCADE` from one of
those parent records or be explicitly removed inside `purge_account_data`.
