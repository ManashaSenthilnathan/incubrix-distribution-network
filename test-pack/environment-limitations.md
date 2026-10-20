# Environment limitations / failed attempts

- `npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=20000` failed with `EAI_AGAIN` while resolving `registry.npmjs.org/@types%2fexpress`.
- The global `tsc` emitted JavaScript when invoked with `--noEmitOnError false`, but reported missing `@types/node`; this does not count as a passing typecheck.
- 12 unit tests ran using Node's test runner against the emitted JavaScript and passed. The Express server could not be started because the Express dependency was unavailable.
- Docker executable was not present; Compose startup was not tested.
