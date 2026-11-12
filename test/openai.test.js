import assert from "node:assert/strict";
import test from "node:test";
import { checkOpenAI } from "../scripts/check-openai.js";

function completedResult(overrides = {}) {
  return {
    id: "resp_test",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              status: "connected",
              organization: "Fictional Integration Test Organization",
            }),
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("OpenAI check sends a synthetic structured form with the requested model/settings", async () => {
  const result = await checkOpenAI({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.reasoning.effort, "medium");
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(
        JSON.parse(body.input[0].content).email,
        "test@example.invalid",
      );
      return Response.json(completedResult(), {
        headers: { "x-request-id": "req_test" },
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "req_test");
  assert.equal(result.responseId, "resp_test");
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("missing API credentials fail before sending a request", async () => {
  await assert.rejects(
    checkOpenAI({
      apiKey: " ",
      fetchImpl: () => assert.fail("Unexpected request"),
    }),
    /Set OPENAI_API_KEY/,
  );
});

test("provider errors give actionable guidance without printing secret-bearing bodies", async () => {
  for (const [status, expected] of [
    [401, /OPENAI_API_KEY/],
    [403, /permissions/],
    [404, /gpt-6-luna/],
    [429, /billing/],
    [500, /availability/],
  ]) {
    await assert.rejects(
      checkOpenAI({
        apiKey: "test-key",
        fetchImpl: async () =>
          new Response("secret credential details", { status }),
      }),
      (error) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(
          error.message,
          /secret credential details|test-key/,
        );
        return true;
      },
    );
  }
});

test("network failures and timeouts fail without exposing request details", async () => {
  for (const name of ["TypeError", "TimeoutError"]) {
    await assert.rejects(
      checkOpenAI({
        apiKey: "test-key",
        fetchImpl: async () => {
          const error = new Error("secret credential details");
          error.name = name;
          throw error;
        },
      }),
      (error) => {
        assert.match(error.message, /Could not reach|timed out/);
        assert.doesNotMatch(
          error.message,
          /secret credential details|test-key/,
        );
        return true;
      },
    );
  }
});

test("incomplete and refused results cannot report success", async () => {
  for (const data of [
    completedResult({ status: "incomplete" }),
    completedResult({
      output: [{ content: [{ type: "refusal", refusal: "Refused" }] }],
    }),
  ]) {
    await assert.rejects(
      checkOpenAI({
        apiKey: "test-key",
        fetchImpl: async () => Response.json(data),
      }),
      /has not passed/,
    );
  }
});

test("unreadable, malformed and mismatched structured responses fail validation", async () => {
  const invalid = (text) =>
    Response.json(
      completedResult({
        output: [{ content: [{ type: "output_text", text }] }],
      }),
    );
  for (const response of [
    new Response("not json"),
    invalid("not json"),
    invalid("null"),
    invalid('{"status":"connected","organization":"wrong organization"}'),
    invalid(
      '{"status":"connected","organization":"Fictional Integration Test Organization","extra":true}',
    ),
  ]) {
    await assert.rejects(
      checkOpenAI({ apiKey: "test-key", fetchImpl: async () => response }),
      /unreadable|valid structured|did not match/,
    );
  }
});
