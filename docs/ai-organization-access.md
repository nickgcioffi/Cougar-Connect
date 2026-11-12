# AI-assisted organization access

## Intended flow

The existing **Request Admin Access** page is `/request-organization-access`,
with templates in both `views/desktop/` and `views/mobile/`. It submits to
`POST /api/organization-access-request`.

Have **GPT-6 Luna (`gpt-6-luna`), medium reasoning**, inspect the submission as a
structured object and recommend one of three outcomes:

1. Automatic decline.
2. Submit to human review.
3. Automatic approval.

The current form object contains `firstName`, `lastName`, `email`,
`organization`, `position`, and `reason`. Keep applicant text as untrusted input
and separate it from the model's instructions and the application's decision rules.

Suggested future model response:

```json
{
  "decision": "human_review",
  "reason": "Organization affiliation still needs verification.",
  "verificationNeeded": ["email_ownership", "organization_affiliation"]
}
```

Constrain `decision` to `decline`, `human_review`, or `approve` using Structured
Outputs. Define the decision criteria before enabling automation. Ambiguous
requests, API failures, refusals and invalid responses should go to human review.
Model judgment about text alone cannot verify an applicant's identity or role.

Add real email delivery and verification later: confirm email ownership, gather
evidence of organization affiliation, then apply the decision and notify the
applicant/reviewer. A verified email alone does not prove permission to administer
an organization. Keep the request, model/version, brief rationale, verification
state and final decision for review. Any resulting admin access should be scoped
to the verified organization. Email provider, review UI and approval criteria
remain to be decided.

## Current scope: verify the OpenAI connection

Run `npm run check:openai` after setting `OPENAI_API_KEY` in the project's local
`ai.env` file (or `.env`). Both files are ignored by Git. The command loads `.env`
first, then `ai.env`; existing shell environment variables take precedence.
Keep the key in server/CLI configuration.

The check makes one Responses API request using `gpt-6-luna` and
`reasoning.effort: "medium"`. It sends a fictional form object, requests strict
JSON output, and verifies the model copied the synthetic organization correctly.
It uses `store: false`, a 30-second timeout and a 1,024 output-token limit. Each
live invocation uses API quota. Success prints `ok: true`, the model/settings,
request/response IDs and the validated synthetic result.

This step adds a CLI check only. The live form continues its existing submission
flow. Automated decisions, permission grants and verification email delivery are
future work.

Verification on November 9, 2026: **the live connection check passed** after
rotating the API key. `ai.env` loads successfully and is ignored by Git. OpenAI
accepted the request using `gpt-6-luna` with medium reasoning and returned the
expected structured result (`status: "connected"` and the fictional organization's
name). This confirms live authentication, model access and the structured-output
round trip. The six local OpenAI mock tests also pass.

Successful request ID: `req_53ad24e8e250470294de1bb7b6c4f323`.
Earlier attempts returned HTTP 401, including after removing a trailing `>` from
the previous key; rotating the key resolved authentication.

Official references:

- [GPT-6 Luna and supported reasoning levels](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Structured Outputs with the Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
