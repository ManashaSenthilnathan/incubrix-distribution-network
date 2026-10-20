# IncuBrix PS4 submission draft — transfer into the official workbook/form

**Deadline:** Tuesday, 20 October 2026, 11:59 PM IST. This is a draft based on the supplied assessment brief. The official PS4 workbook was listed as an email attachment but was not present among the files available in this workspace, so use `Submission_Form_Draft.xlsx` as a worksheet and transfer answers into the official workbook once downloaded.

## Project summary (copy/paste)

I built a simulation-first TypeScript/Express prototype for the IncuBrix Long-Tail Distribution assessment. It includes six connector manifest entries, a shared connector HTTP route, destination posting-rule checks, asynchronous in-memory jobs, idempotency for supported POST workflows, a signed HMAC webhook adapter with a local mock partner, an assisted ready-to-post pack, certification lifecycle evidence marked as simulation, CSV destination catalogue validation/deduplication and a basic relevance score. The implementation is a prototype and does not meet all Core must-haves. Native Discourse, Lemmy, Dev.to and Ghost API adapters, local Lemmy/Ghost test instances, durable storage and a deployed live demo are not complete.

## Repository URL

**Not available yet.** Create a private GitHub repository, push the project, and grant `admin@incubrix.com` reviewer access before entering a URL. Do not enter a guessed URL.

## Live demo URL / access token

**No public live demo is deployed.** Do not invent a URL or token. If the form requires a URL, this is a submission blocker; deploy and verify the service before final submission if time and access allow.

## Local run/access instructions

1. Install Node.js 20+.
2. In the project folder, run `npm install`.
3. Run `npm test` and `npm run typecheck`.
4. Run `npm run dev` and open `http://localhost:8080/health`.
5. Optional: run `docker compose up --build` after verifying Docker is installed.
6. Batch runner: `npm run batch -- test-pack/api-smoke-requests.json ./batch-results`.

These commands are documented but the full app has not been run in this workspace because npm registry DNS failed and Express was not installed. Re-run and record actual outputs on a network-enabled machine.

## Must-haves (honest status)

1. Exact connector contract — **Partial**. Route, method dispatch and manifest entries exist; contract tests and production adapters are not verified.
2. Six Core connectors certified — **No**. Simulation lifecycle is available; no real destination certifications. Four native platform adapters are not implemented. Assisted pack is manual-only.
3. Configuration, not code — **Partial**. Destination config and catalogue rows exist in memory; not durable.
4. Rules before every post — **Partial**. Rule checks exist; full HTTP integration and concurrency testing are missing.
5. Safe test posting/deletion and 429 backoff — **Partial**. Simulation and bounded webhook retry exist; native-platform 429 reset handling and enforced 10-minute cleanup are not implemented.
6. Safe retries — **Partial**. In-memory API idempotency and deterministic simulated IDs; not durable across restart and not guaranteed exactly-once against arbitrary partners.
7. Secrets and simulation — **Partial**. Simulation is default and secrets are environment-based; deployment security not verified.
8. Local Lemmy and Ghost + mock services in Compose — **No**. Compose currently starts the API only.
9. Integration Standard and live demo — **No / Partial**. Some API, job, error, health, logging, manifest and batch components exist; storage, full tests and live demo are missing.

## Highest level completed

**Prototype only; Core not completed.** Do not select Core, Advanced or Outstanding as fully achieved because the brief requires every prior-level item to be verified.

## Test results and metrics

- Unit tests run against TypeScript-emitted JavaScript: **12 passed, 0 failed** (`test-pack/unit-test-output.txt`).
- `npm install`: **failed** in this workspace because registry DNS lookup returned `EAI_AGAIN`.
- Typecheck: **not verified**; compiler reported missing `@types/node` because dependencies were unavailable.
- Express API runtime/integration tests: **not run**.
- Docker Compose: **not run** (Docker unavailable in this workspace).
- Real platform posts/certifications: **0**.
- External AI/model API cost: **USD 0**; no model API is called by the runtime.
- 1,000-row catalogue benchmark, recommendation precision@10, 429 timeout-injection test, live reliability percentage and cost per 1,000 real publications: **not measured**.

## Hard cases

- Title/body over destination limit: unit rule test catches title overflow; HTTP-level response not verified.
- Links, self-promotion and missing AI disclosure: unit rule test catches these.
- Weekly frequency cap: unit test catches second simulated publication after a successful post is recorded.
- Duplicate retry: deterministic simulated ID test passes; persistence across restart not supported.
- Deleted simulated post retried: unit test confirms it is not resurrected.
- Unknown post status: unit test returns `NOT_FOUND`.
- CSV duplicate/bad URL/unsupported platform: catalogue unit test passes for these cases.
- Real 429 reset, expired external token, real content rejection, platform schema drift/demotion, multilingual community and live certification cleanup: **not verified/not implemented**.

## AI tools and costs

OpenAI ChatGPT (GPT-6) was used to interpret the assessment brief, help draft and edit code/tests/documentation, and prepare submission wording. No external AI model/API is called by the application. External AI API spend: USD 0. Verify actual subscription/tool costs independently if the form asks for all development-tool costs; do not report an assumed value.

## Limitations and next steps

The largest blockers are native Discourse/Lemmy/Dev.to/Ghost adapters, local Lemmy/Ghost instances, durable idempotency and job storage, full integration tests, deployment, and real certification evidence. The current keyword relevance score is a heuristic and is not benchmarked. Reachability checks, audience-size enrichment, AI rules capture, tailoring, three extra connectors, recommender precision@10 and a 150-destination researched catalogue are not implemented.

## Declaration

Only sign the originality/commercial-rights declaration if you have reviewed the code, can explain the implementation, and are comfortable with the declaration. Do not claim unimplemented features or test results. The code was AI-assisted and disclosed in `AI_USE.md`.
