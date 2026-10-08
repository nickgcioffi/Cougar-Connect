# Cougar Connect

## App Summary

BYU events are scattered across campus organizations, locations, and communication channels. Students can struggle to know where to look or which opportunities are relevant to them. Cougar Connect focuses first on an upperclassman who wants to build their résumé and get involved on campus. The app brings events into one place, with a searchable calendar and filters for interests, event type, time, location, and hosting organization. Students create a profile and select interests to discover opportunities that fit their goals. They can save events, review event details, and export events to their calendars. This responsive coursework app uses Supabase for profile storage and email verification, providing a starting point for maintenance and support for additional student personas.

## ERD

![Cougar Connect entity relationship diagram](docs/cougar-connect-erd.png)

The Step 1 ERD models User, Interest, Events, and Organization, with join tables for user interests, event interests, saved user events, and event co-hosts.

The Create Profile page saves full name, university, study level, graduation month, primary interest, bio, and the optional profile photo. The backend splits full name into `firstName` and `lastName`, stores university as `uniName`, graduation month as `gradDate` (the first day of that month), and bio as `biography` in the `User` table. Photos are uploaded to the `profile-photos` Storage bucket, with their URL saved as `photoURL`. The integration adds study level, primary interest, and an Auth account link to the ERD's User model.

## Tech Stack

| Layer | Technology | Why it fits our team |
| --- | --- | --- |
| Frontend | HTML5, CSS, vanilla JavaScript (`index.html`, `css/`, `js/app.js`) | Responsive screens and straightforward interactions in a directly editable codebase. |
| Server | Node.js and Express (`server.js`) | Serves the app and provides authenticated API routes for profile and event operations. |
| Database | Supabase PostgreSQL | Stores profiles, interests, events, and organizations using the relational model; row-level security restricts account access. |
| Authentication | Supabase Auth | Handles email/password registration, email verification, sign-in, and password recovery. |
| Photos | Supabase Storage | Stores uploaded profile photos and saves their references with the profile. |
| Build and local tooling | Homebrew, npm, esbuild | Homebrew installs Node.js on macOS; npm installs dependencies, bundles the Supabase browser client, and starts the app. |

The browser sends its signed-in user's token to the Express API. Profile submission calls `save_profile` in Supabase; the app reads saved state from the backend after mutations and on launch. Feed remains unfinished, and event cancellation does not send notification emails.

## How to Get It Running

These instructions target the team's `supabase-integration` branch in [Cougar-Connect on GitHub](https://github.com/nickgcioffi/Cougar-Connect).

1. On macOS, install Homebrew using the instructions at [brew.sh](https://brew.sh), then install Node.js and npm:

   ```sh
   brew install node
   node --version
   npm --version
   ```

2. Clone the repository and switch to the integration branch:

   ```sh
   git clone https://github.com/nickgcioffi/Cougar-Connect.git
   cd Cougar-Connect
   git checkout supabase-integration
   ```

3. Install dependencies, build the app, and start the local server:

   ```sh
   npm ci
   npm run build
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000), or the URL printed in the terminal if the port was overridden. Keep the server running while using the app; press `Ctrl+C` to stop it.
5. Register using an email address you can access. **Supabase will send a verification email.** Check your inbox and spam folder, open the email, and follow its verification link. Return to the app and sign in if prompted.
6. Complete the Create Profile form and continue through interest selection.

For an existing copy of the team repository, start with `git checkout supabase-integration`, then run `npm install`, `npm run build`, and `npm start`.

The team project’s public Supabase configuration is included. For overrides, copy `.env.example` to `.env` and set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and optionally `PORT`. Do not put a service-role or secret key in frontend configuration.

For a new Supabase project, follow [ADMIN_SETUP.md](ADMIN_SETUP.md): the integration SQL requires the existing ERD tables first, then `database/001_supabase_integration.sql`. Enable email/password sign-in and email confirmation, configure email delivery, and allow `http://localhost:3000` as the local Auth redirect URL. With email confirmation enabled, Supabase sends the verification email described above.

## Verifying the Vertical Slice

The working button is **Create profile →**: it stores all information entered on the Create Profile page in Supabase and allows the app to retrieve it after a refresh.

1. Start the integration branch using the instructions above, register, and verify your email through the link Supabase sends.
2. Enter a recognizable full name such as `Jordan Miller`, select a university and study level, and enter a graduation month and primary interest. Add a distinctive bio such as `Looking for technology networking events` and an optional profile photo.
3. Click **Create profile →** and confirm that the app reports success or advances to the next onboarding step. Complete interest selection if prompted.
4. In the team's Supabase project, confirm that the saved profile contains every submitted field, including the photo reference if a photo was uploaded. Inspect the `User` row linked to your account via `authUserID`; confirm `firstName`, `lastName`, `uniName`, `studyLevel`, `gradDate`, `primaryInterest`, `biography`, and `photoURL`. For a photo, also confirm the file exists in the `profile-photos` bucket.
5. Refresh the app, then open the profile or **Settings → Edit profile**. Confirm that the name, university, study level, graduation month, primary interest, bio, and optional photo are restored from the backend.
6. Sign out and sign back in with the verified account, then confirm that the same profile is available. This checks that the saved information is associated with the correct account.

These instructions have been checked against the integration code. Live account creation, email delivery, and database persistence still require verification against the configured Supabase project using the steps above.
