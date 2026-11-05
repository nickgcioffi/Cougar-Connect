# BYU Clubs event import prototype

## Findings

The public BYU Clubs site is a JavaScript application. Its Calendar page is available without signing in at <https://clubs.byu.edu/link/events>. The public calendar displays event title, day, start time, location, and hosting organization. A public event detail page also displays a description, start and end time, location, and hosting club. Detail URLs contain a stable numeric event identifier, for example <https://clubs.byu.edu/link/event/2251799827191779>.

BYU Calendar has a documented public Events API at <https://calendar.byu.edu/byu-calendar-api-documentation> and <https://calendar.byu.edu/events-api>. It accepts categories and date-range parameters and exposes fields such as title, description, location, start/end times, and occurrence IDs. This is a general BYU Calendar API, not a BYU Clubs feed: two Clubs listings checked for November 2026 (Pre-Nursing Careers Night and BYU AI in Research) were absent from that API response. It may help with events cross-posted to BYU Calendar, but it does not provide complete Clubs coverage.

The Clubs application loads Mendix assets and makes `/xas/` requests. Those requests appear to be internal implementation details, so the prototype does not call or depend on them. Instead, `scripts/byu-clubs-calendar-scraper.js` is intended to walk the currently rendered calendar items in the browser and open each public detail page. `scripts/byu-clubs-scraper.js` remains available to scrape a single event detail page.

Coverage is limited to the current calendar view and the events rendered in it. The calendar offers list/calendar views and category/organization filters, but this prototype does not crawl additional months automatically. Events with missing required fields are rejected by the importer. The scraper depends on the calendar continuing to render clickable items with the `.rbc-event-content` class, the detail page continuing to show `Date`, `Time`, and `Location` labels, and the public event URL retaining its numeric identifier. These are page implementation details that can change.

In the November 2026 Brave session, the calendar rendered 114 event entries. I verified the public detail page and extracted the sample below, but the browser-driven attempt did not complete an end-to-end 114-entry crawl: the calendar's client-side navigation did not respond consistently to the scripted click handler. Treat the full-calendar runner as unverified until it produces and downloads a JSON file in your browser. The single-event scraper and JSON importer remain usable for a manually opened event.

The sample event in `data/byu-clubs-events.json` was observed on November 3, 2026: Pre-Nursing Careers Night, Nov. 3, 6–7 PM, KMBL 490, with its public description and source URL. Its stable key is `byu-clubs:2251799827191779`.

## Run locally

1. Open the public BYU Clubs Calendar page in Brave or another browser. Leave it in calendar/month view, select the month you want, and clear filters if you want all currently listed events.
2. Open Developer Tools → Console and run the contents of `scripts/byu-clubs-calendar-scraper.js`. When it completes, confirm the console reports the number of scraped events and that `byu-clubs-scraped.json` downloaded. The runner has not yet completed a full-calendar crawl in the Brave environment used for this prototype; if it stalls, use `scripts/byu-clubs-scraper.js` on a manually opened public event detail page.
3. From the project root, import the JSON:

   ```sh
   node scripts/import-byu-clubs-events.js byu-clubs-scraped.json
   ```

4. Reload Cougar Connect’s Calendar page. Imported items are marked **External · BYU Clubs**, link back to their source page, and use the source event ID for a stable key. Rerunning the import updates records by that key instead of adding duplicates. Imported events are stored in a local JSON file and are not written to Supabase. Restarting the app is not required because the file is read for each state request.

## Remove

This prototype is isolated on `experiment/byu-clubs-event-import`. To remove it, switch away from the branch or revert its prototype changes. If removing individual pieces, delete `data/byu-clubs-events.json`, both `scripts/byu-clubs-*-scraper.js` files, and `scripts/import-byu-clubs-events.js`, then remove the external-event merge from `server.js` and the external labels/details from `js/shared/events.js` and `js/pages/calendar.js`.

## Viability

The public detail pages expose enough information for a useful small import, and event detail URLs provide a stable deduplication key. The general BYU Calendar API could supplement the Clubs scrape for cross-posted events, but current checks do not support treating it as a complete source. The browser scraper depends on current page markup and navigation behavior, and full-calendar automation remains unverified. For a class-project demo, a selected-month scrape plus local JSON import still looks viable with occasional maintenance; a maintained integration should seek an official export or API from BYU Clubs administrators.
