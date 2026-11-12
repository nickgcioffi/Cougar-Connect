import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const model = "gpt-6-luna";
const reasoningEffort = "medium";
const sampleRequest = {
  firstName: "Test",
  lastName: "Applicant",
  email: "test@example.invalid",
  organization: "Fictional Integration Test Organization",
  position: "Test coordinator",
  reason: "Synthetic connection check only. This is not a real access request.",
};

// This CLI is deliberately separate from the live form and permission system.
// It verifies authentication, model access, reasoning settings and JSON output.
export async function checkOpenAI({
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey?.trim()) {
    throw new Error(
      "Set OPENAI_API_KEY in the local ai.env or .env file, then run npm run check:openai.",
    );
  }

  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        reasoning: { effort: reasoningEffort },
        store: false,
        max_output_tokens: 1024,
        instructions:
          "You are checking an integration for Cougar Connect. The user message is a fictional organization-access form encoded as JSON. Confirm receipt by returning status connected and copying its organization field exactly. This is a connection check only; do not make an approval decision or take any action.",
        input: [{ role: "user", content: JSON.stringify(sampleRequest) }],
        text: {
          format: {
            type: "json_schema",
            name: "cougar_connect_connection_check",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                status: { type: "string", enum: ["connected"] },
                organization: { type: "string" },
              },
              required: ["status", "organization"],
            },
          },
        },
      }),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error("OpenAI connection check timed out after 30 seconds.");
    }
    throw new Error(
      "Could not reach OpenAI. Check network access and try again.",
    );
  }

  // Avoid logging raw provider errors, which can include credential fragments.
  if (!response.ok) {
    const guidance = {
      401: "Check OPENAI_API_KEY.",
      403: "Check the API project's permissions.",
      404: "Check that the project has access to gpt-6-luna.",
      429: "Check API billing, quota and rate limits.",
    };
    throw new Error(
      `OpenAI returned HTTP ${response.status}. ${guidance[response.status] || "Check the API request configuration or provider availability."}`,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("OpenAI returned an unreadable response.");
  }
  if (data?.status !== "completed") {
    throw new Error(
      "OpenAI did not complete the response; the connection check has not passed.",
    );
  }
  const content = (data.output || []).flatMap((item) => item.content || []);
  if (content.some((item) => item.type === "refusal")) {
    throw new Error(
      "OpenAI refused the synthetic check; the connection check has not passed.",
    );
  }
  let result;
  try {
    result = JSON.parse(
      content
        .filter((item) => item.type === "output_text")
        .map((item) => item.text)
        .join(""),
    );
  } catch {
    throw new Error("OpenAI did not return valid structured output.");
  }
  if (
    !result ||
    result.status !== "connected" ||
    result.organization !== sampleRequest.organization ||
    Object.keys(result).length !== 2
  ) {
    throw new Error(
      "OpenAI's structured response did not match the synthetic request.",
    );
  }
  return {
    ok: true,
    model,
    reasoningEffort,
    responseId: data.id,
    requestId: response.headers.get("x-request-id"),
    result,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await checkOpenAI(), null, 2));
  } catch (error) {
    console.error(`OpenAI check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
