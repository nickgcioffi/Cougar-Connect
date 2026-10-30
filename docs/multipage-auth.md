# Multi-page authentication setup

Cougar Connect uses dedicated HTML documents with client-side Supabase authentication. Supabase persists the session in browser storage, so it is restored when a user navigates between `/home`, `/calendar`, `/feed`, `/settings`, and `/admin` on the same origin.

## Supabase dashboard configuration

In **Authentication → URL Configuration**:

1. Set **Site URL** to the deployed application origin, such as `https://cougar-connect.example.com`.
2. Add local development and deployed origins to **Redirect URLs**. At minimum, add `http://localhost:3000` and the production origin.
3. Keep email/password authentication enabled under **Authentication → Providers**.

No database migration is required solely for multi-page navigation. Every API request still sends the Supabase access token, and Express verifies it with `auth.getUser()`.

## Temporary admin-page behavior

The `/admin` page and its Settings button are intentionally visible to any signed-in user for development. During this coursework phase, any authenticated user can also create events for any organization and cancel existing events.

For an existing Supabase project, run `database/002_temporary_open_event_mutations.sql` in the SQL editor. New projects receive the same behavior from `001_supabase_integration.sql`.

Unauthenticated requests remain rejected by Express and Supabase. Restore organization-level authorization before production use.
