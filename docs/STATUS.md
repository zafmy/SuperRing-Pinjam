# Status and handoff

## Backend evidence workflow

- Implemented: React/Vite scaffold, Express API, shared TypeScript contract, development fixture, typed API client.
- Implemented: session creation, participant join, authenticated session reads, hashed server-side credentials and single-process disk persistence.
- Frontend create/join: host can create a session and receive a token-free invite URL; a participant can join from `/join/:code`. Role-and-session-scoped credentials stay in browser storage for reload recovery, and authenticated reads poll every two seconds while the page is visible.
- Implemented: host-confirmed missions, photo/question requests, participant image uploads, authenticated image retrieval and assigned-participant observations.
- Implemented: persisted idempotency for new mutations, atomic request/observation changes, media ownership and byte limits. Storage failures do not publish uncommitted state or leave newly uploaded files behind.
- Not implemented: QR generation, agent calls, task actions, semantic image verification and deployment. Photo upload is ready at API level; integration with the phone UI is pending.
- Checks: TypeScript check, eleven API integration tests and production build passed locally on 13 September 2026. Coverage includes the full photo workflow, persistence, authorization/ownership, concurrent retries, oversized/unsupported uploads, malformed input, storage-failure rollback and legacy-session migration.
- Browser smoke check: create/join passed locally on 13 September 2026. A host created a session, a participant joined through the generated invite URL, the host displayed the participant, and both roles recovered their authenticated view after reload. The host dashboard was visually inspected at desktop size. Production server startup succeeded.
- Phone test: not yet performed on physical phones.

## Next owners

- Frontend: create/join screens and saved-session recovery are complete. Next, integrate the real photo/question flow using API_CONTRACT.md v0.2. Use FormData for uploads and authenticated blob fetch for image display.
- Backend: real agent loop and task transitions after model credentials are configured.

Update this file with actual test results and PR links. Do not describe fixture data as a working agent.
