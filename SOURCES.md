# Sources, dependencies and licences

## Runtime and dependencies

- Node.js 20+ runtime; Node.js is distributed under the MIT licence.
- Express 4 (`express`, MIT): HTTP routing and middleware.
- TypeScript (Apache-2.0): source language and type checking.
- `tsx` (MIT): TypeScript execution for development and tests.
- `@types/express` (MIT) and `@types/node` (MIT): development type definitions.
- Node built-in modules used: `node:crypto`, `node:fs/promises`, `node:path`, `node:test`, `node:assert/strict`.

Package versions are declared in `package.json`; dependencies were not installed in this environment because npm registry DNS resolution failed. Verify the resolved dependency tree and licences after a successful `npm install`.

## Data, content and models

- No external dataset, public destination list, AI model, external AI API or third-party media is bundled or called by the default path.
- Test post text is synthetic and intended only for simulation.
- Catalogue relevance scoring uses a small hand-written keyword list (`AI`, `video`, `marketing`, `SaaS`, `creator`, `founder`); it is not an external dataset or a trained model.
- The local mock partner is original test code and stores only in-memory synthetic payloads.

This file is a dependency/source declaration for the current prototype, not a substitute for a software bill of materials. Re-check all resolved package versions and transitive licences before production use.
