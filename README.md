# Cougar Connect

## Access the Website

Open [http://stufordmachine.com:5676/](http://stufordmachine.com:5676/) in your web browser. You can type this URL directly into the address bar on macOS or Windows; include `http://` and the port `:5676`.

No installation or local server setup is required.

## App Summary

BYU events are scattered across campus organizations, locations, and communication channels. Students can struggle to know where to look or which opportunities are relevant to them. Cougar Connect focuses first on an upperclassman who wants to build their résumé and get involved on campus. The app brings sample events into one place, with a searchable calendar and filters for interests, event type, time, location, and hosting organization. Students create a profile and select interests to discover opportunities that fit their goals. They can save events, review event details, and export events to their calendars. The team is connecting this responsive coursework app to Supabase for profile storage and email verification, providing a starting point for maintenance and support for additional student personas.

## ERD

![Cougar Connect entity relationship diagram](docs/cougar-connect-erd.png)

The Step 1 ERD models User, Interest, Events, and Organization, with join tables for user interests, event interests, saved user events, and event co-hosts.

We are implementing a Supabase backend to persist all information entered on the Create Profile page: full name, university, study level, graduation month, primary interest, bio, and optional profile photo. Full name corresponds to FirstName and LastName; university, graduation month, bio, and photo correspond to UniName, GradDate, Biography, and PhotoURL. Study level and primary interest correspond to StudyLevel and PrimaryInterest in the ERD User table.

## Tech Stack

| Layer | Technology | Why it fits our prototype |
| --- | --- | --- |
| Structure | HTML5 (`dist/index.html`) | Standard form controls and a simple entry point without a build process. |
| Presentation | CSS (`dist/styles.css`) | Responsive desktop and mobile layouts without a UI framework. |
| Interaction | Vanilla JavaScript (`dist/app.js`) | Profile creation, interests, calendar filtering, search, and saved events in a directly editable codebase. |
| Persistence | Browser localStorage, key `cougar-demo` | Demonstrates persistence across refreshes without server setup. |
| Backend (in progress) | Supabase | The team is implementing shared backend persistence for every input on the Create Profile page, aligned with the ERD. |
| Data | Fictional sample events and locally created events | Lets the team demonstrate discovery before connecting real event sources. |
| Access | Modern web browser | Opens the hosted app at http://stufordmachine.com:5676/. |

Supabase will send a verification email during account registration; users must follow the link in that email to verify their email address. The static files in this checkout still represent the earlier localStorage prototype.

## Verifying the Vertical Slice

The target working button is **Create profile →**: it should store all information entered on the Create Profile page in Supabase and allow the app to retrieve it after a refresh.

1. Open [http://stufordmachine.com:5676/](http://stufordmachine.com:5676/). Sign in with an existing verified account, or register and verify your email through the link Supabase sends.
2. Enter a recognizable full name such as `John Doe`, select a university and study level, and enter a graduation month and primary interest. Add a distinctive bio such as `Looking for tech networking events` and an optional profile photo.
3. Click **Create profile →** and confirm that the app reports success or advances to the next onboarding step. Complete interest selection if prompted.
4. In the team's Supabase project (nickgcioffi's Org), confirm that the saved profile contains every submitted field, including the photo reference if a photo was uploaded.
5. Refresh the app, then open the profile or **Settings → Edit profile**. Confirm that the name, university, study level, graduation month, primary interest, bio, and optional photo are restored from the backend.
6. Sign out and sign back in with the verified account, then confirm that the same profile is available. This checks that the saved information is associated with the correct account.
