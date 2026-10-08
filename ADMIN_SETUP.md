# Supabase setup and club administrator assignment

## Apply the integration

1. In your Supabase project's SQL Editor, run `database/001_supabase_integration.sql` once, after the existing project tables. The migration adds account links, preferences, admin memberships, row-level security, transactional writes, interest categories, and a profile-photo bucket. It does not import the former fictional events or browser-local profiles. Existing user records require an explicit `authUserID` link before their owners can access them.
2. Under Authentication → URL Configuration, set the Site URL and allowed Redirect URLs to your app URL. For local development, use `http://localhost:3000`. Add the deployed HTTPS URL when you deploy.
3. Ensure email/password authentication is enabled. Configure email delivery for confirmation and password recovery. With email confirmation enabled, users must confirm their email before signing in.
4. From the project folder, run:

   ```sh
   npm install
   npm run build
   npm start
   ```

   Open `http://localhost:3000`. The provided public project configuration is included; optional overrides are documented in `.env.example`. Never use a service-role key in the browser.

## Assign a club administrator

1. Have the administrator create an account, confirm their email, sign in, and complete their profile.
2. In Authentication → Users, copy that account's UUID. This is the Auth ID, not the numeric `User.userID`.
3. In SQL Editor, create the club if it does not exist:

   ```sql
   insert into public."Organization" ("orgName")
   values ('Your Club Name')
   returning "orgID";
   ```

   For an existing club, find its ID:

   ```sql
   select "orgID", "orgName" from public."Organization";
   ```

4. Replace both placeholders and run:

   ```sql
   insert into public."Organization Admins" ("authUserID", "orgID")
   values ('REPLACE_WITH_AUTH_UUID'::uuid, 123)
   on conflict do nothing;
   ```

   Replace `123` with the club's actual `orgID`. Repeat for each organization the account should administer.
5. Have the administrator refresh the app. Settings → Club administration → Open dashboard lets them create and cancel events only for their assigned organizations. Creating a club and granting admin access remain manual Supabase operations; accounts cannot grant themselves access.

## Remove admin access

```sql
delete from public."Organization Admins"
where "authUserID" = 'REPLACE_WITH_AUTH_UUID'::uuid
  and "orgID" = 123;
```

Refresh the app afterward. Permission changes are enforced by the database immediately, even if the dashboard is still open.

## Verify the integration

- Create two accounts. Save an event on one; confirm it is absent from the other's saved list.
- Edit the profile, interests, photo, and launch preference; reload and verify they persist.
- Assign one account to a club. Confirm it can create and cancel that club's events, while the other account cannot.
- Request a password reset and follow the emailed link to set a new password.
- Event creation interprets dates and times in `America/Denver`. Profile photos are publicly readable by URL; each account can upload only to its own folder.
- Feed remains unfinished. Calendar export and sharing use the database event details; cancellation does not send email notifications.
