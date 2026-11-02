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
    res.json({
      profile: profile && {
        name: `${profile.firstName} ${profile.lastName}`,
        uni: profile.uniName,
        level: profile.studyLevel,
        graduation: profile.gradDate.slice(0, 7),
        bio: profile.biography,
        photo: profile.photoURL,
        interest: profile.primaryInterest,
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
      events: events.map((e) => ({
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
      })),
    });
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
  "/": "index.html",
  "/profile": "pages/profile.html",
  "/interests": "pages/interests.html",
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
