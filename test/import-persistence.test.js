import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { spawn, execFile } from "node:child_process";
const execute = promisify(execFile);

const event = {
  sourceKey: "byu-clubs:123",
  sourceUrl: "https://clubs.byu.edu/link/event/123",
  title: " Test Meeting ",
  date: "2026-11-20",
  startTime: "18:00",
  location: " Campus ",
};

test("event import persistence in an isolated data directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cougar-import-"));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "data"));
  const script = join(root, "scripts/import.mjs");
  const data = join(root, "data/byu-clubs-events.json");
  await symlink(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(root, "node_modules"),
    "junction",
  );
  let inputNumber = 0;
  await copyFile(
    new URL("../scripts/import-byu-clubs-events.js", import.meta.url),
    script,
  );
  await writeFile(data, "[]\n");
  const run = async (events) => {
    const input = join(root, `incoming-${inputNumber++}.json`);
    await writeFile(input, JSON.stringify(events));
    return execute(process.execPath, [script, input]);
  };
  const read = async () => JSON.parse(await readFile(data, "utf8"));
  try {
    await t.test(
      "normalizes input and generates stable external IDs",
      async () => {
        await run(event);
        const [stored] = await read();
        assert.equal(stored.title, "Test Meeting");
        assert.equal(stored.location, "Campus");
        assert.equal(stored.organization, "BYU Clubs");
        assert.ok(Number.isSafeInteger(stored.id) && stored.id < 0);
      },
    );
    await t.test(
      "repeated imports preserve IDs without duplicating events",
      async () => {
        const before = await read();
        await run([event, event]);
        assert.deepEqual(await read(), before);
      },
    );
    await t.test(
      "changed events update by source key while retaining unrelated events",
      async () => {
        const [before] = await read();
        const other = {
          ...event,
          sourceKey: "byu-clubs:456",
          sourceUrl: "https://clubs.byu.edu/link/event/456",
        };
        await run([
          other,
          { ...event, title: "Updated meeting", startTime: "19:00" },
        ]);
        const stored = await read();
        assert.equal(stored.length, 2);
        assert.equal(
          stored.find((item) => item.sourceKey === event.sourceKey).id,
          before.id,
        );
        assert.equal(
          stored.find((item) => item.sourceKey === event.sourceKey).title,
          "Updated meeting",
        );
      },
    );
    await t.test(
      "invalid source data aborts the batch before overwriting the file",
      async () => {
        const before = await readFile(data, "utf8");
        for (const invalid of [
          { ...event, sourceUrl: "https://example.invalid/link/event/123" },
          { ...event, title: "" },
          { ...event, startTime: "bad-time" },
        ]) {
          await assert.rejects(
            run([{ ...event, title: "Must not persist" }, invalid]),
          );
          assert.equal(await readFile(data, "utf8"), before);
        }
        await run(event);
        assert.equal((await read()).length, 2);
      },
    );
    await t.test("concurrent imports retain both writers' events", async () => {
      const extra = (id) => ({
        ...event,
        sourceKey: `byu-clubs:${id}`,
        sourceUrl: `https://clubs.byu.edu/link/event/${id}`,
      });
      await Promise.all([run(extra(789)), run(extra(987))]);
      const keys = (await read()).map((item) => item.sourceKey);
      assert.ok(keys.includes("byu-clubs:789"));
      assert.ok(keys.includes("byu-clubs:987"));
    });
    await t.test(
      "recovers an abandoned lock after a crashed importer without losing stored data",
      async () => {
        const before = await readFile(data, "utf8");
        const child = spawn(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import lockfile from 'proper-lockfile'; await lockfile.lock(${JSON.stringify(data)},{stale:5000,update:1000}); console.log('locked'); setInterval(()=>{},1000);`,
          ],
          { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
        );
        try {
          await Promise.race([
            once(child.stdout, "data"),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(Error("Lock startup timeout")),
                5000,
              ).unref(),
            ),
          ]);
          child.kill("SIGKILL");
          await once(child, "exit");
          assert.equal(await readFile(data, "utf8"), before);
          await run(event);
          assert.equal((await read()).length, 4);
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill();
            await once(child, "exit");
          }
        }
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
