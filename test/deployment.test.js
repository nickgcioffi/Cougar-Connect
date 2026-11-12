import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  symlink,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("built release health and recovery after a failed replacement", async (t) => {
  const source = fileURLToPath(new URL("..", import.meta.url));
  const release = await mkdtemp(join(tmpdir(), "cougar-release-"));
  const children = [];
  async function start(port = "0") {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: release,
      env: {
        ...process.env,
        PORT: port,
        HOST: "127.0.0.1",
        SUPABASE_SECRET_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        NODE_OPTIONS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    return child;
  }
  try {
    for (const name of ["server.js", "server", "views", "js", "css", "assets"])
      await cp(join(source, name), join(release, name), { recursive: true });
    await symlink(
      join(source, "node_modules"),
      join(release, "node_modules"),
      "junction",
    );
    await writeFile(join(release, "package.json"), '{"type":"module"}');
    await writeFile(join(release, ".release-sha"), "test-release-123");
    await t.test("generates the browser SDK artifact from source", async () => {
      await build({
        entryPoints: [join(source, "js/auth-client.js")],
        bundle: true,
        format: "iife",
        outfile: join(release, "js/vendor/supabase.js"),
      });
      assert.match(
        await readFile(join(release, "js/vendor/supabase.js"), "utf8"),
        /createSupabaseClient/,
      );
    });
    const active = await start();
    const [output] = await Promise.race([
      once(active.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Startup timeout")), 5000).unref(),
      ),
    ]);
    const base = String(output).match(/http:\/\/127\.0\.0\.1:\d+/)[0];
    await t.test(
      "serves the built assets, login page, and exact release revision",
      async () => {
        assert.deepEqual(await (await fetch(base + "/healthz")).json(), {
          ok: true,
          revision: "test-release-123",
        });
        for (const path of [
          "/login",
          "/js/vendor/supabase.js",
          "/css/styles.css",
        ])
          assert.equal((await fetch(base + path)).status, 200);
      },
    );
    await t.test(
      "failed replacement leaves the active release healthy",
      async () => {
        const replacement = await start(new URL(base).port);
        const [code] = await once(replacement, "exit");
        assert.notEqual(code, 0);
        assert.deepEqual(await (await fetch(base + "/healthz")).json(), {
          ok: true,
          revision: "test-release-123",
        });
      },
    );
  } finally {
    for (const child of children)
      if (child.exitCode === null) {
        child.kill();
        await once(child, "exit");
      }
    await rm(release, { recursive: true, force: true });
  }
});
