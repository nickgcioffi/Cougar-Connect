# Cougar Connect release readiness

## Summary

Reviewed the `main` branch at commit `56108a8` using the checked-in application code, SQL migrations, tests, and workflows. This was a read-only source review; the running production service and live Supabase project were not independently tested.

Cougar Connect is a deployed-capable, database-backed prototype with working code for student accounts, onboarding, event browsing, and saved events. It is still early in product maturity: event importing is absent, the Feed is unfinished, and the current SQL lets any authenticated user create or cancel events.

**Recommendation:** `v0.6.1-alpha` is a sensible label for a progress-tracking release. A site being live on the internet describes its deployment status; it does not by itself make the product beta-ready. The planned `v0.7.0-alpha` can track the next milestone, including improvements to the sign-in and account-creation experience.

## What works in the code

These flows have UI and application logic, subject to correct Supabase configuration, database setup, and storage/email settings:

- **Student accounts and onboarding:** Sign-up, sign-in, email confirmation, password recovery, session checks, profile creation and editing, interest selection, and profile photo upload. See `main:js/pages/login.js`, `main:js/shared/auth.js`, `main:js/pages/profile.js`, and `main:js/pages/interests.js`.
- **Event browsing:** Calendar month navigation, filters for interest, type, time, location, and organization, event details, saved events, Google Calendar export, and sharing. Search covers event name, interest, organization, and location. See `main:js/pages/calendar.js`, `main:js/shared/events.js`, and `main:js/shared/search.js`.
- **Personalized home page:** Shows saved events and events matching the student's selected interests. See `main:js/pages/home.js` and `main:pages/home.html`.
- **Account settings:** Profile and interest editing, password reset, sign-out, and account deletion are represented. Deletion requires server-side service credentials and the corresponding database migration. See `main:js/pages/settings.js`, `main:server.js:151-179`, and `main:database/003_delete_account.sql`.

These are code-level findings, not confirmation that each flow has been validated against the live service.

## Gaps and risks

### Event data and discovery

- **No event importer exists on `main`.** There is no source connector, import job, or tracked event dataset. The server reads events from Supabase (`main:server.js:53-109`), so discovery depends on events being entered or loaded separately.
- **The Feed is a placeholder.** The page identifies itself as a work in progress and does not render feed items (`main:pages/feed.html:40-48`).
- **Launch preference is incomplete.** The setting is stored, but no page uses it to select the next landing page. The database accepts `Search` as a preference, while the settings page does not offer that option (`main:database/001_supabase_integration.sql:54-58`, `main:pages/settings.html:49-59`).
- **The public entry route is sign-in.** On `main`, `/` serves the sign-in page; there is no public feature overview.

### Organization access

- **Event mutation permissions are too broad for a real organization workflow.** The SQL grants all authenticated users permission to create and cancel events. The temporary migration explicitly describes this as an open coursework policy (`main:database/001_supabase_integration.sql:66-89`, `main:database/002_temporary_open_event_mutations.sql:1-32`). A signed-in user could cancel events for everyone.
- **The admin UI does not enforce organization assignments.** It offers all organizations returned by the server and lists all events instead of limiting operations to the user's assigned organizations (`main:js/pages/admin.js:16-36`).
- **Admin Login is not a working flow.** The page has a form but does not load a script or handle submission (`main:pages/admin-login.html:24-54`). The dashboard instead uses regular student account authentication.

### Setup and verification

- **The README is stale.** It describes an earlier `dist/` and localStorage version and says Supabase is still in progress (`main:README.md:23-33`).
- **The database setup is not self-contained.** The first migration assumes the base tables already exist (`main:database/001_supabase_integration.sql:1`), so the repository alone does not recreate an empty database.
- **Automated tests cover a narrow slice.** The single test checks HTTP routes/assets, unauthenticated API rejection, and config/health responses. It does not exercise live authentication, data mutations, event discovery behavior, importing, or authorization boundaries (`main:test/server.test.js:9-88`). The deployment workflow does run tests and a build (`main:.github/workflows/deploy.yml:14-29`).

## Release maturity

**Alpha** is appropriate while core product paths are incomplete or changing and releases are primarily for progress tracking or early feedback. A beta normally has its intended core feature set available to pilot users, with known issues that are limited and understood.

The current code fits **alpha** better because event importing is missing, Feed is unfinished, and organization event permissions are open to every authenticated user. These are product and access-control gaps, not just visual polish.

`main:package.json:3` currently reports version `1.0.0`, which does not match `v0.6.1-alpha`. Align the package version, release tag, and deployed revision as part of release preparation. There are no Git tags in this checkout.

## Roadmap

### First beta

- [ ] **Restrict organization actions.** Enforce organization membership in the database functions; limit event creation and cancellation to assigned organizations; ensure the dashboard uses those assignments. Add coverage proving ordinary accounts cannot perform admin actions.
- [ ] **Establish a reliable event source.** Build an importer for an agreed source with stable external IDs, deduplication, timezone handling, update and cancellation behavior, retries, and import status. Confirm that repeat runs do not duplicate events.
- [ ] **Close or remove unfinished product paths.** Complete Feed or remove it from the supported feature set. Make launch preference work or remove it until implemented.
- [ ] **Validate the student journey end to end.** Cover sign-up and email confirmation, password recovery, onboarding, profile and photo persistence, search and filters, saving events, and organization permissions against a test backend.
- [ ] **Make setup repeatable.** Replace the stale README, document required Supabase configuration and migrations, and verify account deletion with the required service credentials.
- [ ] **Run a limited student and organization pilot.** Track bugs, event coverage, and how fresh imported events remain.

### Stable `v1.0.0`

Before calling the product stable, the beta workflows should be reliable under normal use, with authorization enforced in the database and repeatable deployment and migration procedures. Validate backup and restore, account deletion, monitoring for server and importer failures, and clear expectations for support, privacy, and event freshness. Core navigation should not lead to placeholder features.

## Release recommendation

Use **`v0.6.1-alpha`** for the current progress release and **`v0.7.0-alpha`** for the next planned milestone. Keep the release description clear that the product is live but still evolving. Treat secure organization permissions and a dependable event source as required milestones before calling a release beta.


## Cougar-Connect Development Roadmap

| Release | Primary Goal |
|---------|--------------|
| `v0.6.1-alpha` | Current working prototype |
| `v0.7.0-alpha` | Secure organization permissions and administration |
| `v0.8.0-alpha` | Functional automated event ingestion |
| `v0.9.0-alpha` | End-to-end testing and UI refinement |
| `v1.0.0-beta` | First complete, student-testable experience |
| `v1.0.0` | Stable, production-ready release |
