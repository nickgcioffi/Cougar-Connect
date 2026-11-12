import test from "node:test";
import assert from "node:assert/strict";
import { initializeSupabase, apiRequest, runAction } from "../js/shared/api.js";
import { requireAccount, nextSetupPage } from "../js/shared/auth.js";
import { eventCard, eventCards } from "../js/shared/events.js";

// Small browser fixtures follow the existing viewport tests' simulated-window convention.
test("client authentication, onboarding, and event presentation", async (t) => {
  const originals = { fetch: globalThis.fetch, window: globalThis.window };
  let session = { access_token: "test-token" },
    sessionError = null,
    response = { profile: {}, interests: [] },
    status = 200;
  const requests = [],
    redirects = [];
  globalThis.window = {
    createSupabaseClient: () => ({
      auth: {
        getSession: async () => ({ data: { session }, error: sessionError }),
      },
    }),
    location: { replace: (path) => redirects.push(path) },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json(
      url === "/api/config"
        ? { url: "https://example.invalid", key: "test" }
        : response,
      { status: url === "/api/config" ? 200 : status },
    );
  };
  try {
    await t.test(
      "initializes the auth client once and includes the session token on API requests",
      async () => {
        const client = await initializeSupabase();
        assert.equal(await initializeSupabase(), client);
        assert.equal(
          requests.filter((item) => item.url === "/api/config").length,
          1,
        );
        await apiRequest("state");
        assert.equal(
          requests.at(-1).options.headers.Authorization,
          "Bearer test-token",
        );
      },
    );
    await t.test(
      "save and unsave actions send the intended event state",
      async () => {
        for (const saved of [true, false]) {
          await runAction("save", { id: 12, saved });
          assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
            action: "save",
            payload: { id: 12, saved },
          });
        }
      },
    );
    await t.test(
      "onboarding directs incomplete profiles and interest selections to the right page",
      () => {
        assert.equal(
          nextSetupPage({ profile: null, interests: [] }),
          "/profile",
        );
        assert.equal(
          nextSetupPage({ profile: {}, interests: ["Music", "Sports"] }),
          "/interests",
        );
        assert.equal(
          nextSetupPage({
            profile: {},
            interests: ["Music", "Sports", "Tech"],
          }),
          null,
        );
      },
    );
    await t.test("a valid session loads the account", async () => {
      const context = await requireAccount();
      assert.deepEqual(context.account, response);
      assert.equal(context.session, session);
    });
    await t.test(
      "a missing session or auth error redirects before loading account data",
      async () => {
        for (const error of [null, Error("Expired")]) {
          session = error ? { access_token: "expired" } : null;
          sessionError = error;
          const count = requests.length;
          assert.equal(await requireAccount(), null);
          assert.equal(requests.length, count);
          assert.equal(redirects.at(-1), "/");
        }
        session = { access_token: "test-token" };
        sessionError = null;
      },
    );
    await t.test(
      "API session errors redirect and propagate while service errors propagate",
      async () => {
        status = 401;
        response = { error: "Your session expired. Sign in again." };
        await assert.rejects(requireAccount(), /session expired/);
        assert.equal(redirects.at(-1), "/");
        const count = redirects.length;
        status = 500;
        response = { error: "Service unavailable" };
        await assert.rejects(requireAccount(), /Service unavailable/);
        assert.equal(redirects.length, count);
      },
    );
    await t.test(
      "event cards escape untrusted content and show saved and empty states",
      () => {
        const event = {
          id: 12,
          name: '<img src=x onerror="alert(1)">',
          date: "2026-11-20",
          time: "18:00",
          location: "A & B",
          org: "<Club>",
          genre: "Tech",
        };
        const html = eventCard(event, true);
        assert.doesNotMatch(html, /<img/);
        assert.match(html, /&lt;img/);
        assert.match(html, /A &amp; B/);
        assert.match(html, /♥ Saved/);
        assert.doesNotMatch(eventCard(event, false), /♥ Saved/);
        assert.match(eventCards([], []), /No events found/);
        assert.match(
          eventCard({ ...event, external: true }, false),
          /External · BYU Clubs/,
        );
      },
    );
  } finally {
    globalThis.fetch = originals.fetch;
    if (originals.window === undefined) delete globalThis.window;
    else globalThis.window = originals.window;
  }
});
