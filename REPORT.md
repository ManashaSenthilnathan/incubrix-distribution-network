# Engineering report — IncuBrix Distribution prototype

## Summary

This implementation prioritizes a safe simulation-first connector contract, per-destination publishing rules, deterministic idempotency for simulated posts, a basic certification lifecycle, CSV catalogue validation, and a generic HMAC-SHA256 partner webhook. It is a prototype and **does not meet all must-haves**. No public live demo is deployed and no external native platform has been certified.

## Approach and design decisions

A single TypeScript/Express service exposes the Appendix A connector route and a versioned API for destinations, jobs, certification evidence and catalogue imports. This keeps each supported destination as configuration rather than platform-specific code for every instance. Simulation is the default so test runs do not post to real communities. The in-memory maps are intentionally simple for the time-limited prototype; they must be replaced with durable database storage before production.

The rules engine runs before publication and checks title/body requirements and limits, URL policy, self-promotion, AI disclosure and whether automation is permitted. Frequency cap history is tracked per destination in a rolling seven-day window. The generic signed webhook signs the exact serialized payload with HMAC-SHA256, sends an `X-IncuBrix-Signature: sha256=...` header and uses an idempotency key. A local mock partner supports safe signed-webhook lifecycle testing.

## What is implemented

- Six connector manifest entries and the required HTTP connector route.
- Deterministic simulated publish IDs, status/delete lifecycle and tests against the simulation functions.
- Shared JSON error envelope, `/health`, `/ready`, correlation-aware structured JSON logs and async job status endpoint.
- Rule checks for format limits, links, promotion, AI disclosure, automation policy and frequency cap.
- Assisted ready-to-post pack generation.
- HMAC-signed outbound webhook and local test partner endpoint.
- Certification job workflow with stored in-process evidence; simulation is explicitly marked as not real certification.
- CSV parsing, URL normalization, platform+URL deduplication, row-level validation reports and basic relevance score/reason.
- OpenAPI 3.1 draft and batch runner.

## Verification results and environment limitations

- Unit tests executed against JavaScript emitted by the globally available TypeScript compiler: **12 passed, 0 failed**. Captured output is in `test-pack/unit-test-output.txt`.
- A normal `npm install` could not complete because the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`).
- `tsc` could emit JavaScript but reported missing `@types/node` because npm dependencies were not installed. Therefore **typecheck is not verified**.
- Express was not installed in the environment; the service and HTTP routes could not be started or integration-tested here.
- Docker is unavailable in this environment; Compose startup was not tested.
- No live platform account, real test destination, public demo or external certification evidence is available.

## Must-have assessment

1. **Exact connector contract:** Partial. Route and methods are represented; production platform behavior and contract conformance have not been verified against the evaluator's tests.
2. **Six Core connectors certified:** No. Four native platform connectors are simulation-only; the signed webhook has a local mock; assisted mode generates a pack rather than posting. No real destination certification evidence.
3. **Configuration, not code:** Partial. Destination configurations can be supplied as rows, but there is no durable catalogue database.
4. **Rules checked before every post:** Partial. Main publish path checks rules; integration tests, concurrency safety and persistent cap state are not verified.
5. **Never spam, never cheat:** Partial. Safe simulation default and test-only certification guard exist; real platform 429 reset/backoff and 10-minute cleanup enforcement are not implemented for native platforms.
6. **Safe retries:** Partial. API idempotency and deterministic simulation IDs exist in memory; persistence across restarts and guaranteed external exactly-once behavior are not provided.
7. **Secrets and simulation:** Partial. Simulation is default and secrets are environment-driven; logs avoid secret values. Deployment hardening is not verified.
8. **Local Lemmy/Ghost + mocks:** No. Compose currently starts the service only; local Lemmy and Ghost are not configured.
9. **Integration Standard and live demo:** Partial/No. API spec, jobs, errors, health, logging, manifest and batch runner are present in draft form, but durable files/S3, all-POST idempotency, full integration tests and public demo are missing.

## Advanced and Outstanding

Catalogue import is partial: no reachability or member-count enrichment and no 1,000-row benchmark. Relevance scoring is keyword-based and not evaluated on a labeled set. AI rule capture with human approval, destination-specific tailoring, three extra connectors, precision@10 recommendation, 30-day recertification/demotion, and 150 researched real destinations are not implemented.

## Metrics and costs

- Unit tests: 12 passed / 0 failed in the emitted-JavaScript test run; this does not include HTTP integration tests.
- Real publications: 0; simulated publication count is not asserted as certification.
- External API/model spend: USD 0 in the local simulation path; no paid AI API is called.
- Certification duration, reliability percentage, duplicate-post count under timeout injection, CSV 1,000-row runtime, recommendation precision@10 and cost per 1,000 real publications: **not measured**.

## Next steps

Install dependencies in a network-enabled environment; run `npm test` and `npm run typecheck`; add API integration tests; add durable storage and rate limiting; implement real adapters for Discourse, Lemmy, Dev.to and Ghost; compose local Lemmy/Ghost test instances; add 429 reset/backoff and 10-minute test cleanup enforcement; complete OpenAPI validation; deploy a protected demo; then collect real certification evidence only on owned/approved test destinations.
