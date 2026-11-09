import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
test("Express serves the app and rejects unauthenticated database requests", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "cougar-app-test-"));
  const source = fileURLToPath(new URL("..", import.meta.url));
  const revision = "0123456789abcdef0123456789abcdef01234567";
  await cp(join(source, "server.js"), join(fixture, "server.js"));
  await cp(join(source, "views"), join(fixture, "views"), { recursive: true });
  await cp(join(source, "js"), join(fixture, "js"), { recursive: true });
  await cp(join(source, "css"), join(fixture, "css"), { recursive: true });
  await cp(join(source, "assets"), join(fixture, "assets"), {
    recursive: true,
  });
  await symlink(
    join(source, "node_modules"),
    join(fixture, "node_modules"),
    "junction",
  );
  await writeFile(join(fixture, ".release-sha"), revision + "\n", {
    mode: 0o640,
  });
  const server = spawn(process.execPath, ["server.js"], {
    cwd: fixture,
    env: { ...process.env, HOST: "127.0.0.1", PORT: "3107" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(server.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Server startup timed out")),
          5000,
        ).unref(),
      ),
    ]);
    const base = "http://localhost:3107";
    // Use node:http for virtual-host checks: fetch may replace the Host header.
    const requestView = (url, options = {}) =>
      new Promise((resolve, reject) => {
        const req = request(url, { headers: options.headers }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: res.headers,
              }),
            ),
          );
        });
        req.on("error", reject);
        req.end();
      });
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const landing = await page.text();
    assert.match(landing, /class="landing-page"/);
    assert.match(landing, /href="\/login"/);
    assert.match(landing, /href="\/signup"/);
    assert.doesNotMatch(landing, /js\/vendor\/supabase\.js/);
    for (const path of ["/login", "/signup"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /src="\/js\/vendor\/supabase\.js"/);
      assert.match(html, /src="\/js\/pages\/login\.js"/);
    }
    for (const path of ["/home", "/calendar", "/feed", "/settings", "/admin"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /js\/pages\//);
      if (path === "/settings") {
        assert.match(html, /id="openDeleteAccount"/);
        assert.match(html, /id="deleteAccountDialog"/);
        assert.match(html, /id="confirmDeleteAccount"/);
      }
    }
    const viewRoutes = {
      "/": "index.html",
      "/signup": "signup.html",
      "/login": "login.html",
      "/signin": "login.html",
      "/about": "about.html",
      "/request-organization-access": "request-organization-access.html",
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
    for (const [path, filename] of Object.entries(viewRoutes)) {
      for (const variant of ["desktop", "mobile"]) {
        const response = await requestView(base + path, {
          headers: {
            Host:
              variant === "mobile"
                ? "mobile.cougarconnect.app"
                : "www.cougarconnect.app",
          },
          redirect: "manual",
        });
        assert.equal(response.status, 200, `${variant} ${path}`);
        assert.match(
          await response.text(),
          new RegExp(`name="cc-view" content="${variant}"`),
        );
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
        assert.match(response.headers.get("vary"), /Sec-CH-Viewport-Width/);
        const explicit = await requestView(
          `${base}/views/${variant}/${filename}`,
          {
            headers: {
              Host: "www.cougarconnect.app",
              "Sec-CH-UA-Mobile": "?1",
            },
            redirect: "manual",
          },
        );
        assert.equal(explicit.status, 200);
        assert.match(
          await explicit.text(),
          new RegExp(`name="cc-view" content="${variant}"`),
        );
      }
      assert.equal((await fetch(`${base}/pages/${filename}`)).status, 404);
    }
    for (const hostname of ["www.cougarconnect.app", "cougarconnect.app"]) {
      for (const device of [
        {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
        },
        { "User-Agent": "Mozilla/5.0 (Linux; Android 15)" },
        { "Sec-CH-UA-Mobile": "?1" },
        { "Sec-CH-Viewport-Width": "760", "Sec-CH-UA-Mobile": "?0" },
      ]) {
        const response = await requestView(
          base + "/settings/profile?next=%2Fhome",
          {
            headers: { Host: hostname, ...device },
            redirect: "manual",
          },
        );
        assert.equal(response.status, 302);
        assert.equal(
          response.headers.get("location"),
          "https://mobile.cougarconnect.app/settings/profile?next=%2Fhome",
        );
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
      }
    }
    for (const [headers, expected] of [
      [{ "Sec-CH-Viewport-Width": "761", "Sec-CH-UA-Mobile": "?1" }, "desktop"],
      [{ "Sec-CH-UA-Mobile": "?1" }, "mobile"],
      [
        { "User-Agent": "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" },
        "mobile",
      ],
      [{ Cookie: "other=x; cc_viewport=mobile" }, "mobile"],
      [{ Cookie: "cc_viewport=desktop", "Sec-CH-UA-Mobile": "?1" }, "desktop"],
      [
        { Host: "mobile.cougarconnect.app", "Sec-CH-Viewport-Width": "1440" },
        "mobile",
      ],
    ]) {
      const response = await requestView(base + "/login", {
        headers,
        redirect: "manual",
      });
      assert.equal(response.status, 200);
      assert.match(
        await response.text(),
        new RegExp(`name="cc-view" content="${expected}"`),
      );
    }
    for (const path of [
      "/pages/login",
      "/pages",
      "/index.html",
      "/views/mobile/server.js",
      "/views/desktop/missing.html",
    ]) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    const routingScript = await fetch(base + "/js/shared/view-routing.js");
    assert.equal(routingScript.status, 200);
    const logo = await fetch(base + "/assets/byu-logo.png");
    assert.equal(logo.status, 200);
    assert.match(logo.headers.get("content-type"), /image\/png/);
    assert.deepEqual(
      [...new Uint8Array(await logo.arrayBuffer()).slice(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    const config = await (await fetch(base + "/api/config")).json();
    assert.match(config.url, /^https:\/\//);
    assert.ok(config.key);
    assert.equal(config.secretKey, undefined);
    assert.equal(config.serviceRoleKey, undefined);
    for (const [path, method] of [
      ["state", "GET"],
      ["action", "POST"],
      ["account/delete", "POST"],
    ]) {
      const response = await fetch(base + "/api/" + path, { method });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "Sign in to continue.");
    }
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal(
      (await fetch(base + "/database/001_supabase_integration.sql")).status,
      404,
    );
    const health = await fetch(base + "/healthz");
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.deepEqual(await health.json(), { ok: true, revision });
  } finally {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;

    await rm(fixture, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});
