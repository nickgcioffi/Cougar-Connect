# BYU Clubs event import prototype

## Findings

The public BYU Clubs site is a JavaScript application. Its Calendar page is available without signing in at <https://clubs.byu.edu/link/events>. The public calendar displays event title, day, start time, location, and hosting organization. A public event detail page also displays a description, start and end time, location, and hosting club. Detail URLs contain a stable numeric event identifier, for example <https://clubs.byu.edu/link/event/2251799827191779>.

BYU Calendar has a documented public Events API at <https://calendar.byu.edu/byu-calendar-api-documentation> and <https://calendar.byu.edu/events-api>. It accepts categories and date-range parameters and exposes fields such as title, description, location, start/end times, and occurrence IDs. This is a general BYU Calendar API, not a BYU Clubs feed: two Clubs listings checked for November 2026 (Pre-Nursing Careers Night and BYU AI in Research) were absent from that API response. It may help with events cross-posted to BYU Calendar, but it does not provide complete Clubs coverage.

The Clubs application loads Mendix assets and makes `/xas/` requests. Those requests appear to be internal implementation details, so the prototype does not call or depend on them. Instead, `scripts/byu-clubs-calendar-scraper.js` walks the public list cards in the browser and opens their public detail pages. `scripts/byu-clubs-scraper.js` remains available to scrape a single event detail page.

On November 5, 2026, a live browser check confirmed that `/link/events` still opens the public calendar. The month view showed 114 event entries, and switching to the site's list view showed 407 upcoming events, paginated 10 at a time. Clicking a visible event opened `/link/event/<numeric-id>` with its description, date, time, location, and hosting club. The detail page and stable numeric ID are usable through the rendered public interface. Returning from a detail page resets the calendar to month view, so carrying a full crawl through list pagination remains the main automation issue. This check used the public UI and did not call `/xas/`.

The beta crawler keeps events dated in the current calendar month and the following month, using the browser's local date. It skips cards with explicit dates outside that range. The live list also shows yearless labels such as `DATE / Tuesday, September 8 12:00 PM`; their month is enough to skip September during a November–December crawl. Cards in either target month still have their full date and year verified on the detail page. It does not assume that the list is sorted. It advances through skipped pages automatically and limits each run to ten detail visits. Returning from a detail page still requires restoring list pagination, so a full scan can remain slow.

Progress and accumulated events are saved after each card in the current tab's session storage. Reloading preserves that progress. The crawler reports counts for checked cards, skipped dates, opened details, collected events, and failures. It downloads accumulated events when any exist; an empty run produces a diagnostic report instead of an empty file. The live page's markup and navigation remain dependencies. On November 5, 2026, a live Safari run resumed from saved page 4, checked 248 cards, skipped 238 outside the date window, and opened ten November events with no failures. It downloaded `byu-clubs-scraped-5.json` with ten distinct events dated November 3–4; the JSON passed field and date validation. The run paused at the ten-detail limit with its position saved. This verifies one live batch; a complete two-month scan remains unverified.

The sample event in `data/byu-clubs-events.json` was observed on November 3, 2026: Pre-Nursing Careers Night, Nov. 3, 6–7 PM, KMBL 490, with its public description and source URL. Its stable key is `byu-clubs:2251799827191779`.

## Run locally

1. Open the public BYU Clubs Calendar page in a browser and clear filters if you want all public events. The crawler switches to list view automatically.
2. Open Developer Tools → Console and run the contents of `scripts/byu-clubs-calendar-scraper.js`. It keeps the current month and following month, checks skipped pages automatically, and pauses after up to ten detail visits. Run the script again in the same tab to continue. Collected events download as `byu-clubs-scraped.json`; if none have been collected, check the console report and resume position instead. Click the webpage and press `Q` or `Escape` to stop after the current event, or run `byuClubsCrawler.stop()` in the console. To restart from scratch after a run has stopped, run `byuClubsCrawler.reset()` and then rerun the script. Reloading alone does not reset progress.
3. For a single event, open its public detail page and run `scripts/byu-clubs-scraper.js` in the console instead.
4. From the project root, import the JSON:

   ```sh
   node scripts/import-byu-clubs-events.js byu-clubs-scraped.json
   ```

5. Reload Cougar Connect’s Calendar page. Imported items are marked **External · BYU Clubs**, link back to their source page, and use the source event ID for a stable key. Rerunning the import updates records by that key instead of adding duplicates. Imported events are stored in a local JSON file and are not written to Supabase. Restarting the app is not required because the file is read for each state request.

## Remove

The importer, scrapers, and local event data are part of the current application. To remove the prototype, delete `data/byu-clubs-events.json`, both `scripts/byu-clubs-*-scraper.js` files, and `scripts/import-byu-clubs-events.js`, then remove the external-event merge from `server.js` and the external labels/details from `js/shared/events.js` and `js/pages/calendar.js`.

## Viability

The public detail pages expose enough information for a useful small import, and event detail URLs provide a stable deduplication key. The general BYU Calendar API could supplement the Clubs scrape for cross-posted events, but current checks do not support treating it as a complete source. The browser scraper depends on current page markup and navigation behavior, and full-calendar automation remains unverified. For a class-project demo, a limited date-window scrape plus local JSON import still looks viable with occasional maintenance; a maintained integration should seek an official export or API from BYU Clubs administrators.
