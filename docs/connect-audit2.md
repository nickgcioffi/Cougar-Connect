# Cougar-Connect technical debt and architecture audit

## Scope and confidence

I inspected the local checkout at `/Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect` and its tracked `origin/main` reference. Local `HEAD` and `origin/main` both resolve to `4e886f6d1459e2a3c268abe78e0903436c160614`. The checkout has **eight staged files**—including deployment drafts and changes to `server.js` and `test/server.test.js`—which are included in findings about the current working tree. I did not modify files, install dependencies, or run tests.

The linked public GitHub page did not load through the browsing tool. The comparison therefore uses the local Git remote-tracking reference for `origin/main`; I could not independently confirm GitHub’s live state.

“Confirmed” below means directly supported by the inspected code or repository state. “Suspected risk” means the code suggests a concern, but the available evidence does not establish that it currently causes harm.

## Scorecard

Scores are qualitative judgments, not objective measurements. **5 indicates severe technical debt**; these scores reflect the inspected code and tests, not runtime measurements.

| Category | Score | Basis |
|---|---:|---|
| Coupling and hidden dependencies | 3 | The browser app, Express endpoints, and SQL RPC names are tightly coupled through inline action maps and payload shapes. Deployment also depends on a generated browser bundle. |
| Duplicated implementations | 2 | Interest categories are maintained in both JavaScript and SQL; database actions also have a small layer of server-side name mapping. I found no strong evidence of large duplicated implementations. |
| Cohesion and separation of concerns | 4 | A single browser file handles rendering, auth, API calls, event handling, photo uploads, and calendar exports. Express routes, Supabase access, error handling, and server startup share one file. |
| Complexity and maintainability | 4 | Files are compact in count but dense in implementation. `js/app.js` is 441 lines; `render()` spans lines 78–181, `bind()` 191–323, and `openEvent()` 324–395. Many long inline HTML templates make changes difficult to isolate. |
| Authentication, authorization, and security boundaries | 2 | The inspected design validates user tokens and relies on RLS and security-definer RPCs for writes. Error responses expose backend messages, and several database inputs are weakly validated. I found no evidence of a confirmed authorization bypass. |
| Test coverage and deployment fragility | 4 | One test covers basic server responses and unauthenticated rejection. It does not exercise authenticated flows, RPC authorization, frontend behavior, migrations, or deployment. The build artifact and deployment setup add operational dependencies. |

## Findings

### 1. Backend errors are returned directly to clients

**Severity: Medium — confirmed defect**

[server.js](/Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/server.js:53) logs `error.message` and returns the same message in the JSON response. Database and RPC errors can therefore be exposed to the caller. The handler also maps all such errors to HTTP 400, obscuring whether a failure is a client error or a server/database failure.

**Impact:** Database details or implementation-specific messages may leak, and clients cannot reliably distinguish invalid input from service failures.

**Remediation:** Return a stable, user-safe error message and appropriate status code. Keep the detailed error in server-side logs, with a request identifier for diagnosis.

### 2. Database RPC validation is uneven

**Severity: Medium — confirmed defect**

[database/001_supabase_integration.sql](/Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/database/001_supabase_integration.sql:40–43) validates some profile fields, but does not constrain `uni` to the UI’s allowed choices, validate the graduation value before casting it to a date, or check that `interest` is a known interest. Invalid graduation data can produce a database cast error; other unchecked values can be persisted.

`save_event` at lines 59–65 casts payload fields and writes the saved-event row without explicitly validating that `saved` is a boolean or that the event exists. Database constraints may reject some bad values, but that behavior depends on the existing schema.

**Impact:** Malformed or unsupported input can cause inconsistent data or opaque failures. The database is the actual trust boundary for these writes, so UI validation alone is insufficient.

**Remediation:** Define and enforce payload schemas in each RPC, including value ranges and allowed references. Use explicit column lists in inserts, and return consistent validation errors.

### 3. The migration is not safely repeatable

**Severity: Medium — confirmed operational risk**

The migration uses `CREATE POLICY` without guarding against an existing policy of the same name ([SQL lines 24–32 and 90–92](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/database/001_supabase_integration.sql:24>)). Reapplying it after a partial or successful run can fail at policy creation. The file also says it must run after pre-existing tables, but there is no migration runner or version-tracking mechanism in the inspected repository ([line 1](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/database/001_supabase_integration.sql:1>)).

**Impact:** Setup and recovery depend on manual database state. A rerun may stop before later changes are applied.

**Remediation:** Adopt versioned migrations with documented prerequisites and a tested rollback or recovery path. Make policy creation/replacement behavior explicit and safe for the chosen migration process.

### 4. Frontend responsibilities are concentrated in large functions

**Severity: Medium — confirmed maintainability debt**

[app.js](/Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/js/app.js:78) combines navigation, view rendering, and templates in `render()`. `bind()` at lines 191–323 handles many unrelated interactions, including profile/photo submission, filters, calendar navigation, auth, and event administration. `openEvent()` at lines 324–395 handles event detail rendering, save behavior, calendar exports, and sharing.

**Impact:** UI changes are harder to review and test in isolation. A regression in one view or event handler can affect shared state and unrelated screens.

**Remediation:** Split by feature responsibility: API/auth state, profile onboarding, event discovery, event details, and administration. Introduce small rendering and interaction functions with explicit inputs.

### 5. Frontend and database share duplicated interest lists and implicit contracts

**Severity: Low — confirmed maintenance risk**

The interest list appears in the browser code ([app.js lines 2–11](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/js/app.js:2>)) and is seeded separately in SQL ([migration line 12](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/database/001_supabase_integration.sql:12>)). The server maps action strings to RPC names ([server.js lines 41–47](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/server.js:41>)), while the client constructs action payloads in separate handlers ([app.js lines 213–231 and 315–320](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/js/app.js:213>)).

**Impact:** Renaming an action or changing an interest requires coordinated edits across layers. Mismatches can surface only at runtime.

**Remediation:** Document and validate the client/server/RPC payload contract. Make database-provided categories the sole runtime source for the UI; keep seed data confined to migrations.

### 6. Event calendar exports depend on the viewer’s local timezone

**Severity: Medium — suspected risk**

Event creation validates times against `America/Denver` ([SQL line 71](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/database/001_supabase_integration.sql:71>)). Calendar export builds JavaScript `Date` values from the event’s date and time, then converts them to UTC ([app.js lines 333–339](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/js/app.js:333>)). Those conversions use the browser’s local timezone, which may differ from Mountain Time.

**Impact:** A user whose device is in another timezone may export a reminder at the wrong instant.

**Remediation:** Store event timestamps with an explicit timezone or offset and use that consistently for display and calendar exports. Add coverage for daylight-saving transitions and non-Mountain-Time clients.

### 7. Automated tests cover only a narrow server slice

**Severity: High — confirmed coverage gap**

The repository has one test ([server.test.js lines 5–27](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/test/server.test.js:5>)). It checks health, page/config responses, unauthenticated API rejection, and that selected files return 404. It does not test authenticated access, profile and event RPC behavior, RLS policies, migrations, frontend flows, or deployment. I did not run it.

**Impact:** Important auth, data-integrity, and setup regressions can pass the current automated checks unnoticed.

**Remediation:** Add focused tests for server auth and API behavior, then database/RPC authorization and validation. Add a frontend smoke test for onboarding and key event flows, and a migration check against a disposable test database.

### 8. Deployment drafts create a build and runtime contract that is not enforced by the app

**Severity: Medium — confirmed fragility in staged work**

The page loads `js/vendor/supabase.js` ([index.html line 29](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/index.html:29>)), which is generated by the build script in [package.json](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/package.json:1>). The deployment draft builds it during release creation ([deploy.sh lines 37–42](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/deploy/deploy.sh:37>)); local setup instructions also require a build ([README lines 57–63](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/README.md:57>)). There is no runtime check that the generated file exists. The deployment draft also runs `npm ci` and tests, but does not specify a Node version in the package manifest or workflow.

**Impact:** A checkout started without the build step can serve the page while failing to load its Supabase client. Deployment behavior depends on the server’s installed Node version and generated artifact state.

**Remediation:** Declare and enforce a supported Node version. Add a startup or health check for required build outputs, and make setup/deployment documentation agree on the required build steps.

### 9. README describes an earlier architecture and conflicts with current code

**Severity: Medium — confirmed defect**

The README’s tech-stack table says the app uses `dist/` files and browser `localStorage` ([README lines 25–30](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/README.md:25>)). It then says the checked-out static files are still the earlier localStorage prototype ([line 33](</Users/nickgcioffi/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an-2/work/Cougar-Connect/README.md:33>)), although the current entry point loads `js/app.js` and uses Express/Supabase. The README also directs users to the `supabase-integration` branch in its setup instructions.

**Impact:** Contributors and operators can follow instructions for the wrong architecture or branch.

**Remediation:** Rewrite the setup and architecture sections against the current default branch and working tree. Keep any historical prototype instructions clearly labeled as historical.

## Prioritized recommendations

Effort and regression risk are estimates.

### Must fix before presentation

| Recommendation | Effort | Regression risk |
|---|---:|---:|
| Correct README architecture, branch, and setup instructions | Small: 1–3 hours | Low |
| Replace client-facing raw backend errors with safe messages and appropriate status codes | Small: 2–4 hours | Medium |
| Confirm the presentation environment has the required Supabase bundle and supported Node runtime | Small: 1–3 hours | Medium |

### Safe quick wins

| Recommendation | Effort | Regression risk |
|---|---:|---:|
| Add RPC validation for profile and saved-event payloads | Small: 2–5 hours | Medium |
| Add tests for authenticated API requests and RPC input/authorization behavior | Medium: 1–2 days | Medium |
| Add timezone-aware calendar export coverage and correct timestamp handling | Medium: 1–2 days | Medium |

### Post-presentation refactors

| Recommendation | Effort | Regression risk |
|---|---:|---:|
| Split `js/app.js` by feature and move templates/handlers out of the central render/bind functions | Medium: 2–4 days | Medium–High |
| Add versioned, repeatable database migrations and a documented recovery process | Medium: 2–4 days | Medium–High |
| Consolidate and document frontend/server/RPC contracts and category sourcing | Small–Medium: 1–2 days | Low–Medium |

## Executive summary

Cougar-Connect is a small prototype with a reasonable security direction: the server verifies Supabase user tokens, database access is scoped through the user token, and database writes are routed through authorization-aware RPCs. The main debt is concentrated in a monolithic frontend, uneven database input validation, weak migration repeatability, and a test suite that covers only the server’s unauthenticated surface. Documentation is stale enough to mislead setup and presentation preparation.

## Five most consequential findings

1. **Tests do not cover authenticated behavior, database authorization, or frontend flows.**
2. **Backend errors are returned directly to clients.**
3. **Database RPCs accept several insufficiently validated fields.**
4. **The migration can fail when reapplied and has no versioned migration process.**
5. **The README describes a different app architecture and setup path than the current code.**

## Incremental remediation roadmap

1. **Before presenting:** Update README/setup guidance, verify the actual deployment build and runtime requirements, and sanitize API errors.
2. **Next:** Add payload validation and tests around authenticated API and RPC authorization paths.
3. **Then:** Fix and test timezone handling in calendar exports.
4. **Afterward:** Split the frontend by feature and establish versioned, repeatable database migrations.