# Cougar Connect

## App Summary

BYU events are scattered across campus organizations, locations, and communication channels. Students can struggle to know where to look or which opportunities are relevant to them. Cougar Connect focuses first on an upperclassman who wants to build their résumé and get involved on campus. The app brings sample events into one place, with a searchable calendar and filters for interests, event type, time, location, and hosting organization. Students create a profile and select interests to discover opportunities that fit their goals. They can save events, review event details, and export events to their calendars. The current version is a responsive coursework prototype with browser-local persistence, providing a starting point for maintenance and support for additional student personas.

## ERD

![Cougar Connect entity relationship diagram](docs/cougar-connect-erd.png)

The Step 1 ERD models User, Interest, Events, and Organization, with join tables for user interests, event interests, saved user events, and event co-hosts.

A Supabase backend was implemented to persist all information entered on the Create Profile page: full name, university, study level, graduation month, primary interest, bio, and optional profile photo. Full name corresponds to FirstName and LastName; university, graduation month, bio, and photo correspond to UniName, GradDate, Biography, and PhotoURL. 

## Tech Stack

| Layer | Technology | Why it fits our prototype |
| --- | --- | --- |
| Structure | HTML5 (`dist/index.html`) | Standard form controls and a simple entry point without a build process. |
| Presentation | CSS (`dist/styles.css`) | Responsive desktop and mobile layouts without a UI framework. |
| Interaction | Vanilla JavaScript (`dist/app.js`) | Profile creation, interests, calendar filtering, search, and saved events in a directly editable codebase. |
| Persistence | Browser localStorage, key `cougar-demo` | Demonstrates persistence across refreshes without server setup. |
| Backend | Supabase | Shared backend persistence for every input on the Create Profile page, aligned with the User ERD. |
| Data | Team member inputs | Demonstrate discovery before connecting real user sources. |
| Runtime | Modern web browser; optional static HTTP server | Teammates can run a working copy without installing application dependencies. |

The lightweight frontend keeps setup simple and lets the team focus on the profile and event-discovery experience while implementing the Supabase backend. This checkout is not yet connected to Supabase and has no authentication service or email delivery. The ERD describes the intended relational model; localStorage currently holds one JSON state object containing the profile, interests, saved event IDs, preferences, and events.

## How to Get It Running

1. Get a fresh copy of the team repository: use GitHub's **Code → Download ZIP** and extract it, or run `git clone <team-repository-url>` using the actual repository URL.
2. Open the project folder. Confirm that `dist/index.html`, `dist/styles.css`, and `dist/app.js` are present. No package installation, environment variables, or build step is required.
3. Open `dist/index.html` in a modern browser. Alternatively, if Python 3 is available, run the following from the project root for a consistent localhost origin:

   ```sh
   python3 -m http.server 8000 --directory dist
   ```

4. If using the server, open [http://localhost:8000](http://localhost:8000). Keep the server running while using the app; press `Ctrl+C` in its terminal to stop it.
5. Create a profile, select at least three interests, and click **Find my events →** to enter the app.

Use the same browser and URL when checking saved data. Changing the origin or clearing browser storage gives you a different or fresh local state. The seeded calendar opens to September 2026, when the fictional sample events take place. No hosted app URL is configured in this checkout.

## Verifying the Vertical Slice

The working button is **Create profile →**. It submits the User profile form and saves the profile to localStorage before opening interest selection.

These steps verify the current frontend prototype. Once the Supabase integration is connected, the backend slice must also be verified by confirming that submission stores all profile inputs in Supabase and that refreshing reloads the saved profile from the backend. A successful localStorage check alone does not verify that integration.

1. Open the app using the steps above. If a profile already exists, go to **Settings → Edit profile**.
2. Enter a recognizable full name such as `Jordan Miller`, select a university and study level, and enter a graduation month. Optionally add a distinctive bio such as `Looking for technology networking events` and a photo smaller than 2 MB. Full name and graduation month are required.
3. Click **Create profile →**. Confirm that the app moves to **Step 02 / 02**, the interest-selection screen.
4. Select at least three interests and click **Find my events →**. Confirm that Home greets you by your first name.
5. Refresh the page in the same browser at the same URL. With the default launch preference, Home should reopen and still greet you by name.
6. Go to **Settings** and confirm that your name, university, study level, and bio remain. Click **Edit profile** to confirm that the graduation month and optional photo also remain populated.
7. Optionally, open browser developer tools and inspect **Local Storage → `cougar-demo`**. Its JSON should contain a `profile` object with your submitted values. This demonstrates browser-local persistence, not a database insert or a real user account.

To repeat first-time onboarding, remove only the `cougar-demo` key from this app's localStorage and refresh. This resets all of the prototype's local profile, interest, saved-event, preference, and custom-event data.
