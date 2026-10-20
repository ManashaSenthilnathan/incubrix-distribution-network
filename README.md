# IncuBrix Distribution — long-tail destination prototype

Simulation-first TypeScript/Node service implementing a subset of the IncuBrix Appendix A connector contract. The code is designed to be testable without external accounts or API keys. **This is not a fully Core-certified submission:** the four native platform adapters (Discourse, Lemmy, Dev.to and Ghost) are simulations; local Lemmy/Ghost containers, durable storage, and a deployed public demo are not included.

## Architecture

```text
Client / batch runner
        |
        v
Express API (/api/v1/*) ----> async in-memory jobs + idempotency map
        |                              |
        |                              v
        |                       connector runtime
        |                    / validate / publish \
        v                   / status / delete / metrics \
Rule engine ---- destination catalogue ---- six manifests
        |
        +-- certification lifecycle evidence (simulation clearly labelled)
        +-- CSV catalogue validation/dedup/relevance estimate
        +-- local signed-webhook partner sandbox
```

## Start and test

Requires Node.js 20+ and npm. Dependencies must be downloadable from npm.

1. `cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`)
2. `npm install`
3. `npm test`
4. `npm run typecheck`
5. `npm run dev`
6. Check `http://localhost:8080/health`, `/ready` and `/api/v1/connectors`.
7. Optional container run: `docker compose up --build`.
8. Batch smoke tests: `npm run batch -- test-pack/batch-example.json ./batch-results`.

`SIMULATION_MODE=true` is the safe default. The simulated post URLs are placeholders and do not indicate public posts. Do not switch to live mode until you have an owned test endpoint, a configured secret, and permission to test it.

## API endpoints

- `GET /health`, `GET /ready`
- `GET /api/v1/connectors`
- `GET|POST /api/v1/destinations`
- `POST /api/v1/publish` (requires `Idempotency-Key`; returns `202` and a job ID)
- `GET /api/v1/jobs/{job_id}`
- `POST /api/v1/certifications` and `GET /api/v1/certifications[/{certification_id}]`
- `POST /api/v1/catalogue/import` and `GET /api/v1/catalogue`
- Appendix A route: `POST /connector/v1/{connector_key}/{method}`
- Local partner sandbox: `POST /mock-partner`, `GET|DELETE /mock-partner/{post_id}` (test-only)

The API uses a common JSON error envelope: `{"error":{"code":"UPPER_SNAKE_CASE","message":"...","retryable":false,"details":...}}`.

## Connector contract and current behavior

Connector keys: `discourse`, `lemmy`, `devto`, `ghost`, `signed_webhook`, `assisted`. The simulation path implements deterministic idempotent publish IDs and in-memory status/delete lifecycle for the four simulated native connectors. `signed_webhook` can send an HMAC-SHA256 signed request in non-simulation mode and can use the included local mock partner. `assisted` builds a manual ready-to-post pack with media references, caption, destination link and checklist.

Native Discourse/Lemmy/Dev.to/Ghost production adapters are **not implemented**. The generic webhook is the only outbound live protocol adapter. The mock sandbox is not a third-party platform certification.

## Rules

Before publishing, the service checks required title/body, destination title/body limits, URL permission, self-promotion policy, AI disclosure and `automation_allowed`. A weekly frequency cap is tracked in process memory after successful jobs. Process restart clears destinations, jobs, certification evidence, catalogue rows, idempotency and frequency history; this is not production-safe persistence.

## Catalogue import

`POST /api/v1/catalogue/import` accepts either `{"rows":[...]}` or `{"csv":"name,url,platform_key,...\n..."}` with `Idempotency-Key`. It normalizes URLs, validates required name/URL/platform, deduplicates by normalized URL + platform, produces row-level error/duplicate reports, and adds a basic keyword relevance score (1–5). Reachability checks, member-count enrichment, language validation and 1,000-row performance benchmarking are not implemented.

## Certification

`POST /api/v1/certifications` queues a publish → status → delete → confirm-deleted lifecycle for simulated connectors and stores evidence in memory. Assisted connector certification creates a pack and explicitly requires manual review/posting. Simulation records are labeled `simulated_lifecycle_passed_not_platform_certified`; they are not real platform certification evidence. In non-simulation mode, certification is blocked unless `approved_test_instance: true` is supplied. Only use an owned test instance.

## Configuration and secrets

See `.env.example`. `WEBHOOK_SECRET` and `MOCK_PARTNER_SECRET` are for the local sandbox only; never reuse the sample secret in a deployed environment. Secrets are not logged. No API keys are required for simulation.

## Error codes

`DEST_SPEC_VIOLATION`, `DEST_RULE_FREQUENCY_CAP`, `CONNECTION_AUTH_EXPIRED`, `PLATFORM_RATE_LIMIT`, `PLATFORM_QUOTA_EXHAUSTED`, `PLATFORM_CONTENT_REJECTED`, `PLATFORM_UNAVAILABLE`, `CONNECTOR_DISABLED`, `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `IDEMPOTENCY_KEY_CONFLICT`, `TEST_DESTINATION_REQUIRED`.

## Evidence and known gaps

See `REPORT.md`, `test-pack/`, `SOURCES.md` and `AI_USE.md`. The available environment could not reach the npm registry and has no Docker executable, so a normal dependency install, full typecheck, API runtime tests and Compose startup could not be verified here. The included 12 unit tests were executed from TypeScript-emitted JavaScript with Node's test runner; see `test-pack/unit-test-output.txt`. This is narrower than `npm test` and does not prove the Express service builds or runs.
