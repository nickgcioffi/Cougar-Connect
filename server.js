import express from "express";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set("X-Request-ID", req.requestId);
  next();
});
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
const normalizeEvent = (e) => ({
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
});
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
      events: events.map(normalizeEvent).concat(
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
app.get("/api/events/search", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const term = req.query.q;
  if (typeof term !== "string" || !term.trim() || term.trim().length > 100) {
    return res
      .status(400)
      .json({ error: "Enter a search term of 1–100 characters." });
  }
  try {
    const events = check(
      await req.db
        .rpc("search_events", { search_term: term.trim() })
        .select(
          '*, Organization!orgID(orgName), "Event Interests"(Interest(name))',
        ),
    );
    let external = [];
    try {
      external = JSON.parse(
        readFileSync(root + "data/byu-clubs-events.json", "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const matches = external
      .filter((e) =>
        `${e.title} ${e.organization || "BYU Clubs"} ${e.location || ""}`
          .toLowerCase()
          .includes(term.trim().toLowerCase()),
      )
      .map((e) => ({
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
      }));
    res.json(
      events
        .map(normalizeEvent)
        .concat(matches)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.time.localeCompare(b.time) ||
            a.id - b.id,
        )
        .slice(0, 8),
    );
} catch (error) {
  next(error);
}
});
app.post("/api/action", async (req, res, next) => {
  try {
    const { action, payload } = req.body;
    const functions = {
      profile: "save_profile",
      interests: "save_interests",
      launch: "save_launch",
      save: "save_event",
      event: "create_event",
      delete: "cancel_event",
    };
    if (!functions[action])
      return res.status(400).json({ error: "Unknown action." });
    check(await req.db.rpc(functions[action], { payload }));
    res.json({ ok: true });
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
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again later." });
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
const views = {
  "/signup": "signup.html",
  "/login": "login.html",
  "/signin": "login.html",
  "/about": "about.html",
  "/request-organization-access": "request-organization-access.html",
  "/": "index.html",
  "/profile": "profile.html",
  "/settings/profile": "profile.html",
  "/interests": "interests.html",
  "/settings/interests": "interests.html",
  "/home": "home.html",
  "/calendar": "calendar.html",
  "/feed": "feed.html",
  "/settings": "settings.html",
  "/admin-login": "admin-login.html",
  "/admin": "admin.html",
};

const mobileHost = "mobile.cougarconnect.app";
const mainHosts = new Set(["cougarconnect.app", "www.cougarconnect.app"]);
const mobileBreakpoint = 760;

function preferredView(req) {
  if (req.hostname.toLowerCase() === mobileHost) return "mobile";

  // Client hints use CSS pixels. A browser supplies the actual viewport once
  // available; user agent detection covers the first request on other browsers.
  const width = Number(req.get("Sec-CH-Viewport-Width"));
  if (width > 0) return width <= mobileBreakpoint ? "mobile" : "desktop";

  // The viewport script supplies this cookie for local/preview hosts, where
  // switching subdomains is not possible.
  if (!mainHosts.has(req.hostname.toLowerCase())) {
    const viewport = req
      .get("Cookie")
      ?.match(/(?:^|;\s*)cc_viewport=(mobile|desktop)(?:;|$)/);
    if (viewport) return viewport[1];
  }
  const mobileHint = req.get("Sec-CH-UA-Mobile");
  if (mobileHint === "?1") return "mobile";
  if (mobileHint === "?0") return "desktop";
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(
    req.get("User-Agent") || "",
  )
    ? "mobile"
    : "desktop";
}

function serveView(req, res, filename, variant, explicit = false) {
  res.set("Cache-Control", "private, no-store");
  res.set("Accept-CH", "Sec-CH-UA-Mobile, Sec-CH-Viewport-Width");
  res.vary("Host, User-Agent, Sec-CH-UA-Mobile, Sec-CH-Viewport-Width, Cookie");
  if (
    !explicit &&
    variant === "mobile" &&
    mainHosts.has(req.hostname.toLowerCase())
  ) {
    return res.redirect(302, `https://${mobileHost}${req.originalUrl}`);
  }
  return res.sendFile(root + `views/${variant}/${filename}`);
}

for (const [route, filename] of Object.entries(views)) {
  app.get(route, (req, res) =>
    serveView(req, res, filename, preferredView(req)),
  );
}

// Explicit view URLs allow either version to be opened for development/review.
// Only known templates are exposed; arbitrary files cannot be requested.
for (const variant of ["desktop", "mobile"]) {
  for (const filename of new Set(Object.values(views))) {
    app.get(`/views/${variant}/${filename}`, (req, res) =>
      serveView(req, res, filename, variant, true),
    );
  }
}
app.use("/js", express.static(root + "js"));
app.use("/css", express.static(root + "css"));
app.use("/assets", express.static(root + "assets"));
app.use((error, req, res, next) => {
  console.error("Request failed", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    code: error.code,
    message: error.message,
    details: error.details,
    stack: error.stack,
  });

  if (res.headersSent) return next(error);

  let status = 500;
  let message = "Unable to complete the request. Please try again.";

  if (error.type === "entity.parse.failed") {
    status = 400;
    message = "The request contains invalid JSON.";
  } else if (error.type === "entity.too.large") {
    status = 413;
    message = "The request is too large.";
  } else if (error.code === "42501") {
    status = 403;
    message = "You do not have permission to perform this action.";
  } else if (error.code === "23505") {
    status = 409;
    message = "This information conflicts with an existing record.";
  } else if (
    ["22P02", "23502", "23503", "23514"].includes(error.code)
  ) {
    status = 400;
    message = "Some submitted information is invalid. Check your entries.";
  }

  res.status(status).json({
    error: message,
    requestId: req.requestId,
  });
});
app.listen(port, host, () =>
  console.log(`Cougar Connect: http://${host}:${port}`),
);
