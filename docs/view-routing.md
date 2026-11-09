# Desktop and mobile views

Every HTML page, including the landing page, lives under `views/desktop/` or
`views/mobile/`. The old root `pages/` directory and root `index.html` have been
removed. Existing public URLs (`/`, `/login`, `/home`, `/settings/profile`, etc.)
remain valid and resolve through the selected view directory. `/pages/...` URLs
return 404. Shared assets remain under `/js`, `/css`, and `/assets`; `js/pages/`
contains browser scripts, not HTML routes.

## View selection

- `mobile.cougarconnect.app` always serves mobile views, including on a desktop.
- `www.cougarconnect.app` and `cougarconnect.app` serve desktop views, redirecting
  mobile visitors to HTTPS on `mobile.cougarconnect.app` with the same path and
  query string. Redirects are temporary and are not cached.
- The server uses viewport client hints first, then mobile client hints and a
  device user agent fallback. The viewport breakpoint is **760 CSS pixels**.
- The shared viewport script catches narrow browsers that did not supply client
  hints and viewport changes across the breakpoint. It preserves the path,
  query string, and URL fragment when switching to the mobile hostname.
- On localhost and preview hosts, the server selects a view without a domain
  redirect. The viewport script records the measured size in a session cookie
  and reloads when the selected view differs. Blocked cookies skip that reload.
- Explicit `/views/desktop/<filename>.html` and `/views/mobile/<filename>.html`
  URLs serve the requested template on either host. They bypass automatic
  selection for development and review. Only existing, allowlisted templates
  are exposed; use `index.html` for the landing page.

All page responses use `private, no-store` and vary by device selection headers
and cookie so shared caches do not mix views. API, health, and asset routes do
not redirect. Both hostnames must continue to reach this Express app through
the existing hosting configuration.

The mobile hostname remains mobile even at a wide viewport; this lets visitors
open it intentionally and avoids a redirect loop. Authentication uses browser
storage per origin, so switching hostnames may require signing in again.

## Verification

Run `npm test`. Routing checks cover every public page and explicit view URL,
both hostnames, device headers, viewport boundaries, local cookies, legacy
404s, redirect destinations, cache headers, and browser viewport logic.

Before this change, an HTTP check of the live mobile site returned 200 for all
16 public page routes, shared page scripts/styles, and `/api/config`. Three
successive `/healthz` checks reported `ok: true` at revision
`db72e44428a4b05ff87453f54a87e638d1cf8bc1`. This is an availability baseline,
not a browser rendering or authenticated workflow check; browser inspection
was unavailable in the execution environment. The routing change is validated
locally and has not been deployed.
