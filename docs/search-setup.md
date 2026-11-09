# Search vertical slice setup

1. Copy these changed files into your original project (keep your existing .env):
   - server.js
   - js/shared/api.js
   - js/shared/search.js
   - database/006_search_events.sql
   - test/search.test.js
   - docs/search-setup.md
2. Open your Supabase project, choose SQL Editor, paste database/006_search_events.sql, and run it once. It assumes the existing project schema and earlier migrations are installed. No new tables or secret keys are required.
3. Restart Express with npm start and sign in.
4. Search a known event name, organization, interest, or location. Click a result to open its details. Search for nonsense to check the empty state. Clear the field and press Escape to check dismissal.
5. In browser DevTools > Network, verify /api/events/search?q=... returns matching event JSON. Simulate offline mode and type again to check the error message.
6. Run npm test for local automated checks.

Typing waits 250 milliseconds before requesting Express. Express authenticates the existing session, calls the search_events Supabase function under that user's row-level security policies, merges matching external BYU Clubs events, and returns up to eight results sorted by date/time. Old requests are canceled and stale responses ignored. The detail dialog can open new events even if they were created after the page loaded.

Search treats punctuation such as % and _ literally, ignores capitalization, and accepts up to 100 characters. Matching covers event name, location, organization, and interests, preserving the previous fields.

Local validation: existing server test and new search route integration test pass. The integration test uses a local Supabase stub to verify authentication, validation, response mapping, external-event merging, no matches, and database errors. The SQL function and signed-in browser flow must still be verified against your actual Supabase project after installing the SQL script. Other pages still load event data through /api/state as before.
