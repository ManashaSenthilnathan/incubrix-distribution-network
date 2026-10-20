# Test pack index

| Evidence | What it contains | Important limitation |
|---|---|---|
| `unit-test-output.txt` | Node test-runner output: 12 unit tests passed on JavaScript emitted by global `tsc` | This is not `npm test`; dependency install failed and Express routes were not run. |
| `api-smoke-requests.json` | Repeatable API requests for health, manifests, idempotent destination config, simulated publish, rule blocking and CSV catalogue import | Not yet executed against a running service in this environment. Run with the batch runner after `npm install` and starting the server. |
| `batch-example.json` | Simple GET smoke-test inputs | Not yet executed against a running service in this environment. |

## Claim-to-evidence index

- Simulation lifecycle and deterministic IDs: `../test/connectors.test.ts`, test output in `unit-test-output.txt`.
- Rule checks and weekly cap: `../test/rules.test.ts`, test output in `unit-test-output.txt`.
- CSV normalization, duplicate detection and row errors: `../test/catalogue.test.ts`, test output in `unit-test-output.txt`.
- HTTP routes, Compose, live adapters, platform certification and public demo: **not verified**. See `../REPORT.md`.
