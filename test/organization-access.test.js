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
    position text, reason text, status text check(status in ('Pending','Rejected','Needs Review','Approved')),
    "authUserID" text, "aiRecommendation" text, "aiRationale" text
  )`);
  const mock = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : null;
    if (req.url === "/auth/v1/user") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          email: normalized.email,
        }),
      );
    }
    if (req.url.startsWith("/rest/v1/User?")) {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify([
          { firstName: normalized.firstName, lastName: normalized.lastName },
        ]),
      );
    }
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
    if (
      req.url.startsWith("/rest/v1/Organization%20Access%20Requests") ||
      req.url === "/rest/v1/rpc/submit_access_request"
    ) {
      if (scenario.rateLimited) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            code: "P0429",
            message: "Daily request limit reached",
          }),
        );
      }
      if (scenario.dbFailure) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            code: "XX000",
            message: "private database failure",
          }),
        );
      }
      if (req.method === "PATCH") {
        await db.query(
          'update "Organization Access Requests" set status=$1,"aiRecommendation"=$2,"aiRationale"=$3 where "requestID"=$4',
          [
            body.status,
            body.aiRecommendation,
            body.aiRationale,
            new URL(req.url, "http://local").searchParams
              .get("requestID")
              .slice(3),
          ],
        );
        return res.end(JSON.stringify([{ status: body.status }]));
      }
      const input = body.request_payload;
      const { rows } = await db.query(
        `insert into "Organization Access Requests"
        ("firstName","lastName",email,organization,position,reason,status)
        values ($1,$2,$3,$4,$5,$6,$7) returning "requestID"`,
        [
          input.firstName,
          input.lastName,
          input.email,
          input.organization,
          input.position,
          input.reason,
          "Pending",
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
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid",
        },
        body: JSON.stringify(body),
      });
  }
  try {
    const submit = await start();
    await t.test(
      "rejects blank and non-string fields before contacting providers",
      async () => {
        for (const field of ["organization", "position", "reason"]) {
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
    for (const status of ["Rejected", "Needs Review", "Approved"]) {
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
          const finalStatus = status === "Approved" ? "Needs Review" : status;
          assert.equal(rows[0].status, finalStatus);
          assert.equal(rows[0].email, normalized.email);
          assert.deepEqual(result, {
            ok: true,
            requestID: result.requestID,
            status: finalStatus,
            notificationSent: true,
          });
          assert.equal(calls.length, 4);
          const [databaseCall, ai, updateCall, email] = calls;
          assert.equal(ai.path, "/openai");
          assert.equal(ai.body.model, "gpt-6-luna");
          assert.equal(ai.body.reasoning.effort, "medium");
          assert.equal(ai.body.store, false);
          assert.equal(ai.body.text.format.strict, true);
          assert.deepEqual(ai.body.text.format.schema.properties.status.enum, [
            "Rejected",
            "Needs Review",
            "Approved",
          ]);
          assert.deepEqual(JSON.parse(ai.body.input[0].content), normalized);
          assert.equal(
            databaseCall.headers.authorization,
            "Bearer test-secret",
          );
          assert.deepEqual(databaseCall.body, {
            applicant_id: "00000000-0000-4000-8000-000000000001",
            request_payload: normalized,
          });
          assert.equal(updateCall.body.aiRecommendation, status);
          assert.equal(email.path, "/email");
          assert.deepEqual(email.body.to, [normalized.email]);
          assert.equal(email.body.from, "requests@example.invalid");
          const expected = {
            Rejected: /could not approve/,
            "Needs Review": /human reviewer/,
            Approved: /was approved/,
          };
          assert.match(email.body.text, expected[finalStatus]);
        },
      );
    }
    await t.test(
      "manual database decisions persist and can use the same outcome notifier",
      async () => {
        for (const status of ["Approved", "Rejected"]) {
          const { rows } = await db.query(
            `insert into "Organization Access Requests"
          ("firstName",email,organization,status) values ($1,$2,$3,'Needs Review') returning "requestID"`,
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
        `${name} saves Needs Review and sends the pending email`,
        async () => {
          scenario = failure;
          calls = [];
          const response = await submit();
          assert.equal(response.status, 201);
          assert.equal((await response.json()).status, "Needs Review");
          assert.equal(calls[2].body.status, "Needs Review");
          assert.match(calls[3].body.text, /human reviewer/);
        },
      );
    }
    await t.test(
      "daily limit returns 429 before contacting AI or email",
      async () => {
        scenario = { rateLimited: true };
        calls = [];
        const result = await submit();
        assert.equal(result.status, 429);
        assert.match((await result.json()).error, /3 requests per day/);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].path, "/rest/v1/rpc/submit_access_request");
      },
    );
    await t.test(
      "database failure returns a safe error and sends no email",
      async () => {
        scenario = { dbFailure: true };
        calls = [];
        const response = await submit();
        assert.equal(response.status, 500);
        assert.doesNotMatch(await response.text(), /private database failure/);
        assert.equal(calls.length, 1);
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
        assert.equal(calls[2].body.aiRecommendation, "Approved");
      },
    );
    await t.test(
      "missing provider settings saves Needs Review without sending email",
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
        assert.equal(result.status, "Needs Review");
        assert.equal(result.notificationSent, false);
        assert.equal(calls.length, 2);
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
