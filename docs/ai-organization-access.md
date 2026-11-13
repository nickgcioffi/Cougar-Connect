# Organization access and signed-in landing page

## Current flow

Both desktop and mobile landing pages load the existing persistent Supabase session.
Signed-in visitors see an account indicator and links to open the app or settings.
Normal sign-in still opens `/home`. A request started at
`/request-organization-access` instead returns there after login/signup and, when
needed, profile and interests onboarding. The return destination is allowlisted.

Supabase keeps the authenticated session in browser storage and refreshes it.
The `cc_signed_in` cookie is a non-sensitive UI hint only, scoped to the current
host. It never grants access; every API request validates the Supabase bearer
token. Desktop and mobile production hostnames have separate browser sessions,
so a user switching between those hosts may need to sign in again.

Requests require a signed-in account and an existing profile. The server derives
name and email from that account, ignoring caller-supplied identity fields.
The applicant supplies organization, position and reason. The server saves a
`Pending` record linked to `authUserID` before invoking AI.

AI recommends `Approved`, `Rejected` or `Needs Review`, with a short rationale.
A clear rejection becomes `Rejected`; potential approvals and uncertainties become
`Needs Review`. AI never writes roles or memberships. Provider failures fall back
to human review; failure to save the AI result leaves the original `Pending`
record available. The AI result cannot overwrite a completed operator decision.

Applicants can see their own request history on the request page. Operators can
open **Settings → Operator dashboard** (`/operator/access`) to see
requests, verify applicants independently, select an actual organization record,
and approve or reject. Approval uses one database transaction to assign the
organization, promote the user (preserving operators), and record the reviewer
and decision time. Repeated decisions are rejected. Email is attempted only after
saving; email failure does not undo a saved decision.

Operators can revoke individual organization assignments on the same page.
Removing the last assignment returns an organization admin to `user`.
Operators keep their role. Database RPCs enforce role and organization membership
on event creation, editing and deletion, replacing migration 002's temporary open
permissions. A new API state load reflects role changes without signing in again.

## Database setup

Apply `database/007_organization_access.sql` in Supabase after migrations 001–006
before running this version of the application. It is an incremental migration;
do not execute the contextual schema dump. It supports the supplied existing
`User.role` and request table, normalizes legacy status names, adds applicant and
organization references plus AI/reviewer metadata, and creates RLS and atomic
approval/revocation functions. Legacy requests without an applicant reference
cannot grant access; the applicant must submit again while signed in.

Create the first operator using trusted Supabase SQL administration, after that
person has created a profile. Substitute their actual authentication user UUID:

```sql
update public."User"
set role = 'operator'
where "authUserID" = 'ACTUAL_AUTH_USER_UUID'::uuid;
```

The app does not allow self-promotion. Existing explicit organization assignments
are promoted to `organization_admin` during the migration. Configure
`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) for saving requests,
`OPENAI_API_KEY` for AI screening, and `RESEND_API_KEY` plus `RESEND_FROM_EMAIL`
for notifications. Secrets stay on the server.

## OpenAI connection diagnostic

Run `npm run check:openai` after setting `OPENAI_API_KEY` in the project's local
`ai.env` file (or `.env`). Both files are ignored by Git. The command loads `.env`
first, then `ai.env`; existing shell environment variables take precedence.
Keep the key in server/CLI configuration.

The check makes one Responses API request using `gpt-6-luna` and
`reasoning.effort: "medium"`. It sends a fictional form object, requests strict
JSON output, and verifies the model copied the synthetic organization correctly.
It uses `store: false`, a 30-second timeout and a 1,024 output-token limit. Each
live invocation uses API quota. Success prints `ok: true`, the model/settings,
request/response IDs and the validated synthetic result.

Verification on November 9, 2026: **the live connection check passed** after
rotating the API key. `ai.env` loads successfully and is ignored by Git. OpenAI
accepted the request using `gpt-6-luna` with medium reasoning and returned the
expected structured result (`status: "connected"` and the fictional organization's
name). This confirms live authentication, model access and the structured-output
round trip. The six local OpenAI mock tests also pass.

Successful request ID: `req_53ad24e8e250470294de1bb7b6c4f323`.
Earlier attempts returned HTTP 401, including after removing a trailing `>` from
the previous key; rotating the key resolved authentication.

Official references:

- [GPT-6 Luna and supported reasoning levels](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Structured Outputs with the Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

## Settings by role

Settings reads the role returned by the authenticated `/api/state` response.
`user` sees account and app settings without administration links.
`organization_admin` additionally sees a Club dashboard button and their assigned
club names. `operator` sees an Operator dashboard button linking to human review
and access management. Role sections start hidden until account data loads.

## Adding organizations

Apply `database/008_operator_organizations.sql` after 007 to enable the operator
screen's **Add organization** form on desktop and mobile. Organization creation
requires the operator role in both the API and database function. Names are
trimmed, whitespace is normalized, and matching names reuse an existing record
case-insensitively, including concurrent submissions. Creating an organization
does not grant membership or approve any request. The organization immediately
becomes available in approval dropdowns; existing review selections are preserved.

## Request limits

Apply `database/009_access_request_limits.sql` after 007–008. Each authenticated
account can submit at most three access requests per calendar day in
`America/Denver`, resetting at local midnight (including daylight saving time).
All saved submissions count, regardless of AI/decision status. Invalid form data
is rejected before saving. The service-only submission RPC locks per applicant
and counts/inserts in one transaction, so concurrent requests and multiple app
servers share the same limit. Over-limit requests return HTTP 429 before AI or
email calls. The request page shows the remaining allowance and disables submit
at zero; the database enforces the limit independently of browser state.
