import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

const userID = "00000000-0000-4000-8000-000000000001";
const event = {
  eventID: 12,
  name: "Club meeting",
  orgID: 7,
  Organization: { orgName: "Test Club" },
  "Event Interests": [{ Interest: { name: "Technology" } }],
  type: "Meeting",
  date: "2026-11-20",
  time: "18:00:00",
  endTime: "19:00:00",
  location: "Campus",
  description: "Details",
};

test("authenticated application workflows", async (t) => {
  let calls = [],
    scenario = {},
    profile = null;
  const mock = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const url = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(url.pathname);
    calls.push({
      path,
      method: req.method,
      query: url.searchParams,
      body,
      token: req.headers.authorization,
    });
    res.setHeader("Content-Type", "application/json");
    const reply = (value, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    const fail = (code, status = 400) =>
      reply({ code, message: "private database details" }, status);
    if (path === "/auth/v1/user") {
      if (req.headers.authorization !== "Bearer valid")
        return fail("bad_jwt", 401);
      return reply({ id: userID, email: "test@example.invalid" });
    }
    if (path === "/auth/v1/token") {
      if (scenario.passwordRateLimit)
        return fail("over_request_rate_limit", 429);
      if (scenario.passwordFailure) return fail("invalid_credentials");
      return reply({
        user: { id: scenario.wrongUser ? "other-user" : userID },
        access_token: "verified",
        refresh_token: "refresh-test",
        token_type: "bearer",
        expires_in: 3600,
      });
    }
    if (path.startsWith("/storage/v1/object/list/")) {
      if (scenario.storageFailure) return fail("storage_error", 500);
      return reply(
        body.prefix === userID ? [{ id: "photo", name: "avatar" }] : [],
      );
    }
    if (path.startsWith("/storage/v1/object/")) return reply([]);
    if (path.startsWith("/auth/v1/admin/users/")) return reply({});
    if (path.startsWith("/rest/v1/rpc/")) {
      if (scenario.rpcError) return fail(scenario.rpcError);
      if (path === "/rest/v1/rpc/event_has_ended")
        return reply(!scenario.eventNotEnded);
      if (path.endsWith("save_profile")) {
        const p = body.payload;
        profile = {
          firstName: p.name.split(" ")[0],
          lastName: p.name.split(" ").slice(1).join(" "),
          uniName: p.uni,
          studyLevel: p.level,
          gradDate: p.graduation + "-01",
          biography: p.bio,
          photoURL: p.photo,
        };
      }
      return reply(null);
    }
    if (scenario.readFailure) return fail("XX000", 500);
    const table = path.slice("/rest/v1/".length);
    if (table === "User") return reply(profile ? [profile] : []);
    if (table === "Interest") return reply([{ name: "Technology" }]);
    if (table === "User Interests")
      return reply([{ Interest: { name: "Technology" } }]);
    if (table === "UserEvents") return reply([{ eventID: 12 }]);
    if (table === "Organization Admins")
      return reply(
        scenario.noAdmins
          ? []
          : [{ orgID: 7, Organization: { orgName: "Test Club" } }],
      );
    if (table === "Organization")
      return reply([{ orgID: 7, orgName: "Test Club" }]);
    if (table === "Events")
      return reply([
        { ...event, endTime: scenario.noEndTime ? null : event.endTime },
      ]);
    if (table === "Event Reviews") {
      if (req.method === "POST") return reply(null, 201);
      return reply([
        {
          reviewID: 1,
          eventID: 12,
          rating: 5,
          comment: "Great",
          created_at: "2026-11-21",
        },
      ]);
    }
    return fail("unexpected_route", 404);
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      NODE_OPTIONS: "",
      SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`,
      SUPABASE_PUBLISHABLE_KEY: "test-key",
      SUPABASE_SECRET_KEY: "test-secret",
      SUPABASE_SERVICE_ROLE_KEY: "",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const [output] = await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Startup timeout")), 5000).unref(),
      ),
    ]);
    const base = String(output).match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    const request = (path, body, token = "valid") =>
      fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    await t.test(
      "missing, invalid, and expired tokens cannot read or mutate data",
      async () => {
        for (const token of ["", "invalid", "expired"]) {
          for (const [path, body] of [
            ["/api/state"],
            [
              "/api/organization-access-request",
              {
                organization: "Test Club",
                position: "Officer",
                reason: "Manage events",
              },
            ],
            ["/api/organization-access-requests"],
            ["/api/operator/access"],
            ["/api/operator/organizations", { name: "New Club" }],
            [
              "/api/operator/access/decision",
              { requestID: 1, decision: "Approved", orgID: 7 },
            ],
            ["/api/operator/access/revoke", { authUserID: userID, orgID: 7 }],
            ["/api/action", { action: "delete", payload: { id: 12 } }],
            ["/api/reviews", { eventID: 12, rating: 5 }],
            ["/api/account/delete", { password: "secret" }],
          ]) {
            calls = [];
            assert.equal((await request(path, body, token)).status, 401);
            assert.ok(calls.every((call) => call.path === "/auth/v1/user"));
          }
        }
      },
    );
    const actions = {
      profile: [
        "save_profile",
        {
          name: "Test Applicant",
          uni: "BYU",
          level: "Undergraduate",
          graduation: "2028-04",
          bio: "Test bio",
          photo: "https://example.invalid/avatar",
        },
      ],
      interests: ["save_interests", ["Technology", "Sports", "Music"]],
      launch: ["save_launch", "Calendar"],
      save: ["save_event", { id: 12, saved: true }],
      event: ["create_event", { name: "Meeting", orgID: 7 }],
      delete: ["cancel_event", { id: 12 }],
    };
    for (const [action, [rpc, payload]] of Object.entries(actions)) {
      await t.test(
        `${action} forwards its payload with the signed-in user's credentials`,
        async () => {
          calls = [];
          const response = await request("/api/action", { action, payload });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { ok: true });
          const call = calls.find((item) => item.path.endsWith(rpc));
          assert.deepEqual(call.body, { payload });
          assert.equal(call.token, "Bearer valid");
        },
      );
    }
    await t.test(
      "profile fields and event relations survive a subsequent state load",
      async () => {
        calls = [];
        const response = await request("/api/state");
        assert.equal(response.status, 200);
        const state = await response.json();
        assert.deepEqual(state.profile, actions.profile[1]);
        assert.deepEqual(state.saved, [12]);
        assert.deepEqual(state.interests, ["Technology"]);
        assert.deepEqual(state.admins, [{ id: 7, name: "Test Club" }]);
        assert.equal(
          state.events.find((item) => item.id === 12).org,
          "Test Club",
        );
        const profileCall = calls.find((item) => item.path === "/rest/v1/User");
        assert.equal(profileCall.query.get("authUserID"), `eq.${userID}`);
        assert.ok(calls.every((call) => call.token === "Bearer valid"));
      },
    );
    await t.test(
      "new accounts receive a null profile and default launch preference",
      async () => {
        const previous = profile;
        profile = null;
        const state = await (await request("/api/state")).json();
        assert.equal(state.profile, null);
        assert.equal(state.launch, "Home");
        profile = previous;
      },
    );
    await t.test("unknown actions never invoke an RPC", async () => {
      calls = [];
      assert.equal(
        (await request("/api/action", { action: "grant_admin" })).status,
        400,
      );
      assert.equal(calls.length, 1);
    });
    for (const [code, status] of [
      ["42501", 403],
      ["23505", 409],
      ["23514", 400],
      ["XX000", 500],
    ]) {
      await t.test(
        `database error ${code} maps to HTTP ${status} without leaking details`,
        async () => {
          scenario = { rpcError: code };
          const response = await request("/api/action", {
            action: "event",
            payload: {},
          });
          assert.equal(response.status, status);
          const body = await response.json();
          assert.equal(body.requestId, response.headers.get("x-request-id"));
          assert.doesNotMatch(body.error, /private database/);
          scenario = {};
        },
      );
    }
    await t.test(
      "a failed state query cannot return partial account data",
      async () => {
        scenario = { readFailure: true };
        assert.equal((await request("/api/state")).status, 500);
        scenario = {};
      },
    );
    await t.test(
      "review validation rejects invalid ratings, IDs, and oversized comments",
      async () => {
        for (const payload of [
          { rating: 0 },
          { rating: 6 },
          { rating: 2.5 },
          { eventID: "12" },
          { comment: "x".repeat(1001) },
          { comment: null },
        ]) {
          calls = [];
          assert.equal(
            (
              await request("/api/reviews", {
                eventID: 12,
                rating: 5,
                ...payload,
              })
            ).status,
            400,
          );
          assert.equal(calls.length, 1);
        }
      },
    );
    for (const [name, state] of [
      ["missing end time", { noEndTime: true }],
      ["event not ended", { eventNotEnded: true }],
    ]) {
      await t.test(
        `reviews reject ${name} without inserting feedback`,
        async () => {
          scenario = state;
          calls = [];
          try {
            assert.equal(
              (await request("/api/reviews", { eventID: 12, rating: 5 }))
                .status,
              403,
            );
            assert.equal(
              calls.some(
                (call) =>
                  call.path === "/rest/v1/Event Reviews" &&
                  call.method === "POST",
              ),
              false,
            );
          } finally {
            scenario = {};
          }
        },
      );
    }
    await t.test(
      "reviews use authenticated identity and trim comments",
      async () => {
        calls = [];
        assert.equal(
          (
            await request("/api/reviews", {
              eventID: 12,
              rating: 5,
              comment: " Great ",
              authUserID: "someone-else",
            })
          ).status,
          201,
        );
        const insert = calls.find(
          (call) =>
            call.path === "/rest/v1/Event Reviews" && call.method === "POST",
        );
        assert.ok(insert, "Review should be inserted after eligibility checks");
        const ended = calls.find(
          (call) => call.path === "/rest/v1/rpc/event_has_ended",
        );
        assert.deepEqual(ended.body, { target_event_id: 12 });
        assert.equal(ended.token, "Bearer valid");
        assert.deepEqual(insert.body, {
          eventID: 12,
          rating: 5,
          comment: "Great",
          authUserID: userID,
        });
        assert.equal(insert.token, "Bearer valid");
      },
    );
    await t.test(
      "admin reviews query assigned organizations and their events",
      async () => {
        calls = [];
        const response = await request("/api/admin/reviews");
        assert.equal(response.status, 200);
        assert.equal(
          (await response.json()).reviews[0].eventName,
          "Club meeting",
        );
        assert.equal(calls[1].query.get("authUserID"), `eq.${userID}`);
        assert.equal(calls[2].query.get("orgID"), "in.(7)");
        assert.equal(calls[3].query.get("eventID"), "in.(12)");
      },
    );
    await t.test(
      "users without organization assignments cannot fetch reviews",
      async () => {
        scenario = { noAdmins: true };
        calls = [];
        assert.deepEqual(await (await request("/api/admin/reviews")).json(), {
          reviews: [],
        });
        assert.equal(calls.length, 2);
        scenario = {};
      },
    );
    for (const [name, failure, status] of [
      ["wrong password", { passwordFailure: true }, 403],
      ["different verified account", { wrongUser: true }, 403],
      ["verification rate limit", { passwordRateLimit: true }, 429],
      ["storage failure", { storageFailure: true }, 500],
    ]) {
      await t.test(`account deletion stops on ${name}`, async () => {
        scenario = failure;
        calls = [];
        assert.equal(
          (await request("/api/account/delete", { password: "secret" })).status,
          status,
        );
        assert.ok(
          !calls.some(
            (call) =>
              call.path.includes("purge_account_data") ||
              call.path.includes("/admin/users/"),
          ),
        );
        scenario = {};
      });
    }
    await t.test(
      "account deletion requires a password before any destructive operation",
      async () => {
        calls = [];
        assert.equal((await request("/api/account/delete", {})).status, 400);
        assert.equal(calls.length, 1);
      },
    );
    await t.test(
      "account deletion removes only the authenticated account's files, data, and identity in order",
      async () => {
        calls = [];
        assert.equal(
          (
            await request("/api/account/delete", {
              password: "secret",
              userID: "someone-else",
            })
          ).status,
          200,
        );
        const removal = calls.find(
          (call) => call.path === "/storage/v1/object/profile-photos",
        );
        assert.deepEqual(removal.body.prefixes, [`${userID}/avatar`]);
        const purge = calls.find((call) =>
          call.path.endsWith("purge_account_data"),
        );
        assert.deepEqual(purge.body, { target_auth_user_id: userID });
        const deletion = calls.at(-1);
        assert.equal(deletion.path, `/auth/v1/admin/users/${userID}`);
        assert.ok(calls.indexOf(removal) < calls.indexOf(purge));
        for (const call of [removal, purge, deletion])
          assert.equal(call.token, "Bearer test-secret");
      },
    );
  } finally {
    child.kill();
    await once(child, "exit");
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
  }
});
