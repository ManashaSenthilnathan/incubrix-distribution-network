# Demo video plan (maximum 8 minutes; record only after the service runs)

This is a recording plan, not evidence that a demo has already been recorded. Do not submit it as a video.

## 0:00–0:45 — scope and safety
- Show README and explain that simulation mode is default and no real community is contacted.
- State clearly that this is a prototype; the native platform adapters and local Lemmy/Ghost stack remain incomplete.

## 0:45–1:30 — start and health
- Run `npm install`, `npm test`, `npm run typecheck` and `npm run dev` in a working Node 20+ environment.
- Show actual terminal outputs and `/health`, `/ready`, `/api/v1/connectors`.
- Do not edit or conceal failed test output.

## 1:30–3:00 — rules and safe publish
- Use `test-pack/api-smoke-requests.json` with the batch runner.
- Show one simulated publication returning a job ID, then poll `/api/v1/jobs/{job_id}`.
- Show a promotional post blocked by a destination with `self_promo_allowed:false` and a title/body limit violation.
- Explain idempotency key behavior and the in-memory persistence limitation.

## 3:00–4:00 — assisted pack
- Call `POST /connector/v1/assisted/build_assist_pack` with synthetic text and a destination URL.
- Show caption, media references, deep link and human checklist. Explain it does not auto-post.

## 4:00–5:00 — catalogue import
- Run the CSV catalogue import with a valid row, a normalized duplicate and an invalid URL.
- Show imported/duplicate/error counts and the row-level report.
- Explain reachability and audience-size enrichment are not implemented.

## 5:00–6:00 — HMAC partner sandbox
- If the local server has been verified, show the signed webhook request to `/mock-partner`, then status and delete. Use a local-only secret from `.env`; never show real secrets.
- If this flow fails, show the failure and explain it rather than editing the recording.

## 6:00–7:00 — tests and design decision
- Show `test-pack/unit-test-output.txt` and run `npm test` on the target machine.
- Explain the decision to default to simulation and why in-memory state is not suitable for production.

## 7:00–8:00 — limitations
- List the incomplete must-haves: native platform adapters, local Lemmy/Ghost, durable storage, public deployment and real certification evidence.
- End with the next steps. Keep the screen recording unedited as required.
