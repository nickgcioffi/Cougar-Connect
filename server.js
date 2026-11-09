import express from "express";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const app = express();
const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
let revision = "development";
try {
  revision = readFileSync(root + ".release-sha", "utf8").trim() || revision;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const url =
  process.env.SUPABASE_URL || "https://hvomujwvovwmilotgolp.supabase.co";
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_HPk1MkktUxhDvtRp8tS1OA_i-YCp2cD";
const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminDb = secretKey
  ? createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.get("/api/config", (req, res) => res.json({ url, key }));


app.post("/api/organization-access-request", async (req, res, next) => {
  try {
    if (!adminDb) {
      return res.status(503).json({
        error: "Organization access requests are not configured.",
      });
    }

    const {
      firstName,
      lastName,
      email,
      organization,
      position,
      reason,
    } = req.body ?? {};

    const fields = [
      firstName,
      lastName,
      email,
      organization,
      position,
      reason,
    ];

    if (fields.some((value) => typeof value !== "string" || !value.trim())) {
      return res.status(400).json({
        error: "Please complete all required fields.",
      });
    }

    const { data, error } = await adminDb
      .from("Organization Access Requests")
      .insert({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        organization: organization.trim(),
        position: position.trim(),
        reason: reason.trim(),
      })
      .select("requestID")
      .single();

    if (error) throw error;

    res.status(201).json({
      ok: true,
      message: "Your organization access request was submitted successfully.",
      requestID: data.requestID,
    });
  } catch (error) {
    next(error);
  }
});


app.use("/api", async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "Sign in to continue." });

  req.db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await req.db.auth.getUser(token);

  if (error || !data.user)
    return res
      .status(401)
      .json({ error: "Your session expired. Sign in again." });

  req.user = data.user;
  next();
});
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
app.get("/api/state", async (req, res, next) => {
  try {
    const db = req.db;
    const results = await Promise.all([
      db.from("User").select("*").eq("authUserID", req.user.id).maybeSingle(),
      db.from("Interest").select("*").order("interestID"),
      db
        .from("Events")
        .select(
          '*, Organization!orgID(orgName), "Event Interests"(Interest(name))',
        )
        .order("date"),
      db.from("User Interests").select("Interest(name)"),
      db.from("UserEvents").select("eventID").eq("isSaved", true),
      db
        .from("Organization Admins")
        .select("orgID, Organization!orgID(orgName)"),
      db.from("Organization").select("orgID, orgName").order("orgName"),
    ]);
    const [profile, interests, events, chosen, saved, admins, organizations] =
      results.map(check);
    let externalEvents = [];
    try {
      externalEvents = JSON.parse(
        readFileSync(root + "data/byu-clubs-events.json", "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    res.json({
      profile: profile && {
        name: `${profile.firstName} ${profile.lastName}`,
        uni: profile.uniName,
        level: profile.studyLevel,
        graduation: profile.gradDate.slice(0, 7),
        bio: profile.biography,
        photo: profile.photoURL,
      },
      launch: profile?.launchPreference || "Home",
      interests: chosen.map((x) => x.Interest.name),
      saved: saved.map((x) => x.eventID),
      categories: interests.map((x) => x.name),
      admins: admins.map((x) => ({
        id: x.orgID,
        name: x.Organization.orgName,
      })),
      organizations: organizations.map((x) => ({
        id: x.orgID,
        name: x.orgName,
      })),
      events: events
        .map((e) => ({
          id: e.eventID,
          name: e.name,
          org: e.Organization.orgName,
          orgID: e.orgID,
          genres: e["Event Interests"].map((x) => x.Interest.name),
          genre: e["Event Interests"][0]?.Interest.name || "",
          type: e.type,
          time: e.time,
          date: e.date,
          location: e.location,
          desc: e.description || "",
        }))
        .concat(
          externalEvents.map((e) => ({
            id: e.id,
            name: e.title,
            org: e.organization || "BYU Clubs",
            orgID: null,
            genres: [],
            genre: "External event",
            type: "External",
            time: e.startTime,
            endTime: e.endTime,
            date: e.date,
            location: e.location || "Location not provided",
            desc: e.description || "",
            external: true,
            source: "BYU Clubs",
            sourceUrl: e.sourceUrl,
            sourceKey: e.sourceKey,
          })),
        ),
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/admin/reviews", async (req, res, next) => {
  try {
    const { data: admins, error: adminError } = await req.db
      .from("Organization Admins")
      .select("orgID")
      .eq("authUserID", req.user.id);

    if (adminError) throw adminError;

    const orgIDs = admins.map((admin) => admin.orgID);

    if (!orgIDs.length) {
      return res.json({ reviews: [] });
    }

    const { data: events, error: eventsError } = await req.db
      .from("Events")
      .select("eventID, name, orgID")
      .in("orgID", orgIDs);

    if (eventsError) throw eventsError;

    if (!events.length) {
      return res.json({ reviews: [] });
    }

    const { data: reviews, error: reviewsError } = await req.db
      .from("Event Reviews")
      .select("reviewID, eventID, rating, comment, created_at")
      .in("eventID", events.map((event) => event.eventID))
      .order("created_at", { ascending: false });

    if (reviewsError) throw reviewsError;

    res.json({
      reviews: reviews.map((review) => ({
        ...review,
        eventName: events.find(
          (event) => event.eventID === review.eventID,
        )?.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reviews", async (req, res, next) => {
  try {
    const { eventID, rating, comment = "" } = req.body ?? {};

    if (
      !Number.isSafeInteger(eventID) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      typeof comment !== "string" ||
      comment.length > 1000
    ) {
      return res.status(400).json({
        error: "Select a rating from 1 to 5 and enter a valid comment.",
      });
    }

    const { error } = await req.db.from("Event Reviews").insert({
      eventID,
      authUserID: req.user.id,
      rating,
      comment: comment.trim(),
    });

    if (error) throw error;

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function listStorageFiles(bucket, folder) {
  const paths = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await adminDb.storage.from(bucket).list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null)
        paths.push(...(await listStorageFiles(bucket, path)));
      else paths.push(path);
    }
    if (data.length < 1000) return paths;
  }
}
app.post("/api/account/delete", async (req, res, next) => {
  try {
    if (!adminDb)
      return res.status(503).json({
        error: "Account deletion is not configured on this server.",
      });

    const password = req.body?.password;
    if (typeof password !== "string" || !password || !req.user.email)
      return res.status(400).json({ error: "Enter your current password." });

    const verificationClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error: verificationError } =
      await verificationClient.auth.signInWithPassword({
        email: req.user.email,
        password,
      });
    if (verificationError?.status === 429)
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    if (verificationError || data.user?.id !== req.user.id)
      return res.status(403).json({ error: "Could not verify your password." });

    const bucket = "profile-photos";
    const files = await listStorageFiles(bucket, req.user.id);
    for (let index = 0; index < files.length; index += 1000) {
      check(
        await adminDb.storage
          .from(bucket)
          .remove(files.slice(index, index + 1000)),
      );
    }

    check(
      await adminDb.rpc("purge_account_data", {
        target_auth_user_id: req.user.id,
      }),
    );
    const { error } = await adminDb.auth.admin.deleteUser(req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, revision });
});
const pages = {
  "/signup": "pages/signup.html",
  "/login": "pages/login.html",
  "/signin": "pages/login.html",
  "/about": "pages/about.html",
  "/request-organization-access": "pages/request-organization-access.html",
  "/": "index.html",
  "/profile": "pages/profile.html",
  "/settings/profile": "pages/profile.html",
  "/interests": "pages/interests.html",
  "/settings/interests": "pages/interests.html",
  "/home": "pages/home.html",
  "/calendar": "pages/calendar.html",
  "/feed": "pages/feed.html",
  "/settings": "pages/settings.html",
  "/admin-login": "pages/admin-login.html",
  "/admin": "pages/admin.html",
};
for (const [route, page] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(root + page));
}
app.use("/js", express.static(root + "js"));
app.use("/css", express.static(root + "css"));
app.use("/assets", express.static(root + "assets"));
app.use((error, req, res, next) => {
  console.error(error.message);
  res
    .status(400)
    .json({ error: error.message || "Unable to complete the request." });
});
app.listen(port, host, () =>
  console.log(`Cougar Connect: http://${host}:${port}`),
);
