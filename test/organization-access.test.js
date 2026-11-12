import { sendOrganizationAccessNotification } from "../server/organization-access.js";
import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const applicant = {
  firstName: " Test ",
  lastName: " Applicant ",
  email: " TEST@example.invalid ",
  organization: " Test Club ",
  position: " Officer ",
  reason: " Publish club events ",
};
const normalized = Object.fromEntries(
  Object.entries(applicant).map(([key, value]) => [
    key,
    key === "email" ? value.trim().toLowerCase() : value.trim(),
  ]),
);

function aiResult(status = "Approved") {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ status, rationale: "Test review" }),
          },
        ],
      },
    ],
  };
}

test("organization access submission, AI review, persistence, and email", async (t) => {
  let scenario = {},
    calls = [];
  const db = new PGlite();
  await db.exec(`create table "Organization Access Requests" (
    "requestID" bigint generated always as identity primary key,
    "firstName" text, "lastName" text, email text, organization text,
    position text, reason text, status text check(status in ('Denied','Pended','Approved'))
  )`);
  const mock = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : null;
    calls.push({ path: req.url, body, headers: req.headers });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/openai") {
      if (scenario.networkFailure) return req.socket.destroy();
      res.statusCode = scenario.aiHttp || 200;
      return res.end(
        scenario.aiRaw ?? JSON.stringify(scenario.aiResult ?? aiResult()),
      );
    }
    if (req.url === "/email") {
      res.statusCode = scenario.emailHttp || 200;
      return res.end(JSON.stringify({ id: "email-test" }));
    }
    if (req.url.startsWith("/rest/v1/Organization%20Access%20Requests")) {
      if (scenario.dbFailure) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            code: "XX000",
            message: "private database failure",
          }),
        );
      }
      const { rows } = await db.query(
        `insert into "Organization Access Requests"
        ("firstName","lastName",email,organization,position,reason,status)
        values ($1,$2,$3,$4,$5,$6,$7) returning "requestID"`,
        [
          body.firstName,
          body.lastName,
          body.email,
          body.organization,
          body.position,
          body.reason,
          body.status,
        ],
      );
      res.statusCode = 201;
      return res.end(JSON.stringify(rows[0]));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "cougar-access-"));
  const preload = join(directory, "providers.mjs");
  // Redirect provider calls in the child process. No real credentials or messages.
  await writeFile(
    preload,
    `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      if (input === "https://api.openai.com/v1/responses") input = ${JSON.stringify(mockUrl + "/openai")};
      if (input === "https://api.resend.com/emails") input = ${JSON.stringify(mockUrl + "/email")};
      return originalFetch(input, options);
    };
  `,
  );
  const children = [];
  async function start(overrides = {}) {
    const child = spawn(process.execPath, ["--import", preload, "server.js"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        HOST: "127.0.0.1",
        NODE_OPTIONS: "",
        SUPABASE_URL: mockUrl,
        SUPABASE_PUBLISHABLE_KEY: "test-key",
        SUPABASE_SECRET_KEY: "test-secret",
        SUPABASE_SERVICE_ROLE_KEY: "",
        OPENAI_API_KEY: "test-openai",
        RESEND_API_KEY: "test-resend",
        RESEND_FROM_EMAIL: "requests@example.invalid",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    // Read the ephemeral listening port reported by the application.
    const output = await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error("Server exited before startup");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Startup timeout")), 5000).unref(),
      ),
    ]);
    const port = String(output[0]).match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1];
    assert.ok(port && port !== "0", "server reports its bound port");
    return (body = applicant) =>
      fetch(`http://127.0.0.1:${port}/api/organization-access-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
  }
  try {
    const submit = await start();
    await t.test(
      "rejects blank and non-string fields before contacting providers",
      async () => {
        for (const field of Object.keys(applicant)) {
          for (const value of [" ", null, 123]) {
            calls = [];
            assert.equal(
              (await submit({ ...applicant, [field]: value })).status,
              400,
            );
            assert.equal(calls.length, 0);
          }
        }
      },
    );
    for (const status of ["Denied", "Pended", "Approved"]) {
      await t.test(
        `persists ${status} and emails the requester after saving`,
        async () => {
          scenario = { aiResult: aiResult(status) };
          calls = [];
          const response = await submit();
          assert.equal(response.status, 201);
          const result = await response.json();
          assert.ok(Number.isSafeInteger(result.requestID));
          const { rows } = await db.query(
            'select * from "Organization Access Requests" where "requestID"=$1',
            [result.requestID],
          );
          assert.equal(rows[0].status, status);
          assert.equal(rows[0].email, normalized.email);
          assert.deepEqual(result, {
            ok: true,
            message:
              "Your organization access request was submitted successfully.",
            requestID: result.requestID,
            status,
            notificationSent: true,
          });
          assert.equal(calls.length, 3);
          const [ai, databaseCall, email] = calls;
          assert.equal(ai.path, "/openai");
          assert.equal(ai.body.model, "gpt-6-luna");
          assert.equal(ai.body.reasoning.effort, "medium");
          assert.equal(ai.body.store, false);
          assert.equal(ai.body.text.format.strict, true);
          assert.deepEqual(ai.body.text.format.schema.properties.status.enum, [
            "Denied",
            "Pended",
            "Approved",
          ]);
          assert.deepEqual(JSON.parse(ai.body.input[0].content), normalized);
          assert.equal(
            databaseCall.headers.authorization,
            "Bearer test-secret",
          );
          assert.deepEqual(databaseCall.body, { ...normalized, status });
          assert.equal(email.path, "/email");
          assert.deepEqual(email.body.to, [normalized.email]);
          assert.equal(email.body.from, "requests@example.invalid");
          const expected = {
            Denied: /could not approve/,
            Pended: /human reviewer/,
            Approved: /was approved/,
          };
          assert.match(email.body.text, expected[status]);
        },
      );
    }
    await t.test(
      "manual database decisions persist and can use the same outcome notifier",
      async () => {
        for (const status of ["Approved", "Denied"]) {
          const { rows } = await db.query(
            `insert into "Organization Access Requests"
          ("firstName",email,organization,status) values ($1,$2,$3,'Pended') returning "requestID"`,
            [normalized.firstName, normalized.email, normalized.organization],
          );
          const { rows: reviewed } = await db.query(
            `update "Organization Access Requests" set status=$1 where "requestID"=$2 returning *`,
            [status, rows[0].requestID],
          );
          assert.equal(reviewed[0].status, status);
          calls = [];
          const sent = await sendOrganizationAccessNotification(
            reviewed[0],
            reviewed[0].status,
            {
              apiKey: "test-resend",
              from: "requests@example.invalid",
              fetchImpl: (_, options) => fetch(mockUrl + "/email", options),
            },
          );
          assert.equal(sent, true);
          assert.deepEqual(calls[0].body.to, [normalized.email]);
          assert.match(
            calls[0].body.text,
            status === "Approved" ? /was approved/ : /could not approve/,
          );
        }
        await assert.rejects(
          db.query(
            `update "Organization Access Requests" set status='Unknown'`,
          ),
        );
      },
    );
    const failures = {
      "provider HTTP error": { aiHttp: 429 },
      "network failure": { networkFailure: true },
      "unreadable provider response": { aiRaw: "invalid JSON" },
      "incomplete review": { aiResult: { status: "incomplete", output: [] } },
      refusal: {
        aiResult: {
          status: "completed",
          output: [{ content: [{ type: "refusal" }] }],
        },
      },
      "malformed structured output": {
        aiResult: {
          status: "completed",
          output: [{ content: [{ type: "output_text", text: "{}" }] }],
        },
      },
      "unsupported status": { aiResult: aiResult("Unexpected") },
    };
    for (const [name, failure] of Object.entries(failures)) {
      await t.test(
        `${name} saves Pended and sends the pending email`,
        async () => {
          scenario = failure;
          calls = [];
          const response = await submit();
          assert.equal(response.status, 201);
          assert.equal((await response.json()).status, "Pended");
          assert.equal(calls[1].body.status, "Pended");
          assert.match(calls[2].body.text, /human reviewer/);
        },
      );
    }
    await t.test(
      "database failure returns a safe error and sends no email",
      async () => {
        scenario = { dbFailure: true };
        calls = [];
        const response = await submit();
        assert.equal(response.status, 500);
        assert.doesNotMatch(await response.text(), /private database failure/);
        assert.equal(calls.length, 2);
      },
    );
    await t.test(
      "email failure preserves the saved request and returns success",
      async () => {
        scenario = { emailHttp: 503 };
        calls = [];
        const response = await submit();
        assert.equal(response.status, 201);
        assert.equal((await response.json()).notificationSent, false);
        assert.equal(calls[1].body.status, "Approved");
      },
    );
    await t.test(
      "missing provider settings saves Pended without sending email",
      async () => {
        scenario = {};
        calls = [];
        const unconfigured = await start({
          OPENAI_API_KEY: "",
          RESEND_API_KEY: "",
          RESEND_FROM_EMAIL: "",
        });
        const response = await unconfigured();
        assert.equal(response.status, 201);
        const result = await response.json();
        assert.equal(result.status, "Pended");
        assert.equal(result.notificationSent, false);
        assert.equal(calls.length, 1);
      },
    );
    await t.test(
      "missing database credentials returns 503 before reviewing",
      async () => {
        calls = [];
        const unconfigured = await start({ SUPABASE_SECRET_KEY: "" });
        assert.equal((await unconfigured()).status, 503);
        assert.equal(calls.length, 0);
      },
    );
  } finally {
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode !== null) return;
        child.kill();
        await once(child, "exit");
      }),
    );
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
    await rm(directory, { recursive: true, force: true });
    await db.close();
  }
});
