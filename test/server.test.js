import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
test("Express serves the app and rejects unauthenticated database requests", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "cougar-app-test-"));
  const source = fileURLToPath(new URL("..", import.meta.url));
  const revision = "0123456789abcdef0123456789abcdef01234567";
  await cp(join(source, "server.js"), join(fixture, "server.js"));
  await cp(join(source, "index.html"), join(fixture, "index.html"));
  await cp(join(source, "pages"), join(fixture, "pages"), { recursive: true });
  await cp(join(source, "js"), join(fixture, "js"), { recursive: true });
  await cp(join(source, "css"), join(fixture, "css"), { recursive: true });
  await symlink(
    join(source, "node_modules"),
    join(fixture, "node_modules"),
    "dir",
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
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /js\/vendor\/supabase.js/);
    for (const path of ["/home", "/calendar", "/feed", "/settings", "/admin"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /js\/pages\//);
    }
    const config = await (await fetch(base + "/api/config")).json();
    assert.match(config.url, /^https:\/\//);
    assert.ok(config.key);
    for (const [path, method] of [
      ["state", "GET"],
      ["action", "POST"],
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
    server.kill();
    await rm(fixture, { recursive: true, force: true });
  }
});
