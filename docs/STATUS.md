# Status and handoff

## Backend evidence workflow

- Implemented: React/Vite scaffold, Express API, shared TypeScript contract, development fixture, typed API client.
- Implemented: session creation, participant join, authenticated session reads, hashed server-side credentials and single-process disk persistence.
- Frontend create/join: host can create a session and receive a token-free invite URL; a participant can join from `/join/:code`. Role-and-session-scoped credentials stay in browser storage for reload recovery, and authenticated reads poll every two seconds while the page is visible.
- Frontend evidence: the host can send a real photo or question request to a joined participant. The assigned participant can submit a text answer or one JPEG/PNG/WebP file, and session members see received observations; images use authenticated blob fetches and are labelled as unverified evidence.
- Implemented: host-confirmed missions, photo/question requests, participant image uploads, authenticated image retrieval and assigned-participant observations.
- Implemented: persisted idempotency for new mutations, atomic request/observation changes, media ownership and byte limits. Storage failures do not publish uncommitted state or leave newly uploaded files behind.
- Not implemented: QR generation, agent calls, task actions, semantic image verification and deployment. The photo UI needs a physical-phone/camera smoke test before demo use.
- Checks: TypeScript check, eleven API integration tests and production build passed locally on 13 September 2026. Coverage includes the full photo workflow, persistence, authorization/ownership, concurrent retries, oversized/unsupported uploads, malformed input, storage-failure rollback and legacy-session migration.
- Browser smoke check: create/join and host-issued question → participant answer → shared evidence passed locally on 13 September 2026. Both roles recovered their authenticated view after reload, and the host dashboard was visually inspected at desktop size. The browser image-picker flow was not manually exercised; the server photo workflow is covered by integration tests. Production server startup succeeded.
- Phone test: not yet performed on physical phones.

## Next owners

- Frontend: create/join and real photo/question UI flows are complete. Test camera/image upload on the physical phones before the demo; then integrate later task UI only after its contract is available.
- Backend: real agent loop and task transitions after model credentials are configured.

Update this file with actual test results and PR links. Do not describe fixture data as a working agent.
