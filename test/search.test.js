import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("search validates, queries as the user, merges external events, and handles failures", async () => {
  let fail = false,
    received;
  const mock = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/auth/v1/user"))
      return res.end(JSON.stringify({ id: "user" }));
    assert.ok(req.url.startsWith("/rest/v1/rpc/search_events"));
    assert.equal(req.headers.authorization, "Bearer token");
    let body = "";
    for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    if (fail) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ message: "Unavailable" }));
    }
    res.end(
      JSON.stringify(
        received.search_term === "absent"
          ? []
          : [
              {
                eventID: 99,
                name: "Careers Fair",
                Organization: { orgName: "Careers" },
                "Event Interests": [{ Interest: { name: "Professional" } }],
                date: "2026-11-04",
                time: "12:00:00",
                location: "Campus",
              },
            ],
      ),
    );
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: "3108",
      HOST: "127.0.0.1",
      SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`,
      SUPABASE_PUBLISHABLE_KEY: "key",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Startup timeout")), 5000).unref(),
      ),
    ]);
    const search = (q, auth = true) =>
      fetch(`http://127.0.0.1:3108/api/events/search?${q}`, {
        headers: auth ? { Authorization: "Bearer token" } : {},
      });
    assert.equal((await search("q=Careers", false)).status, 401);
    for (const q of ["q=", "q=" + "a".repeat(101), "q=a&q=b"])
      assert.equal((await search(q)).status, 400);
    const response = await search("q=Careers");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const events = await response.json();
    assert.equal(received.search_term, "Careers");
    assert.equal(events.length, 2);
    assert.equal(events[0].external, true);
    assert.equal(events[1].id, 99);
    assert.deepEqual(events[1].genres, ["Professional"]);
    assert.deepEqual(await (await search("q=absent")).json(), []);
    fail = true;
    assert.equal((await search("q=Careers")).status, 500);
  } finally {
    child.kill();
    await once(child, "exit");
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
  }
});
