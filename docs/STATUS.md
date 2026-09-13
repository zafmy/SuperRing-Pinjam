# Status and handoff

## Shared starter

- Implemented: React/Vite scaffold, Express API, shared TypeScript contract, development fixture, typed API client.
- Implemented: session creation, participant join, authenticated session reads, hashed server-side credentials and single-process disk persistence.
- Frontend create/join: host can create a session and receive a token-free invite URL; a participant can join from `/join/:code`. Role-and-session-scoped credentials stay in browser storage for reload recovery, and authenticated reads poll every two seconds while the page is visible.
- Not implemented: QR generation, photo upload, agent calls, task actions, verification, deployment.
- Checks: TypeScript check, four API integration tests and production build passed locally on 13 September 2026. The tests cover two participants sharing persistent state, credentials absent from snapshots/storage, cross-session access rejection, invalid input and malformed JSON.
- Browser smoke check: passed locally on 13 September 2026. A host created a session, a participant joined through the generated invite URL, the host displayed the participant, and both roles recovered their authenticated view after reload. The host dashboard was visually inspected at desktop size. Production server startup succeeded.
- Phone test: not yet performed on physical phones.

## Next owners

- Frontend: create/join screens and saved-session recovery using implemented APIs are complete. Next, integrate request/photo/task UI only after the backend contract is updated.
- Backend: request/photo/observation flow, then the real agent loop.

Update this file with actual test results and PR links. Do not describe fixture data as a working agent.
