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

## Integration checkpoint

- Frontend PR #2 merged after local checks passed: typecheck, all 11 API tests and production build.
- Integration fixes: request IDs use Web Crypto getRandomValues for HTTP LAN phone access; older polling responses cannot replace newer session revisions; request and answer fields are locked while submitting to avoid mixing file/text retries.
- Homepage capability copy and README now reflect the implemented evidence UI.
- Physical-phone image picking/upload and real model calls still need verification. No local .env file was present at this checkpoint.

## Dokploy deployment preparation

- Added a multi-stage Node 22 Dockerfile with build-time checks, a non-root runtime, and an API health check; .dockerignore excludes secrets and local session data.
- Added docs/DOKPLOY.md with persistent storage, single-instance stop-first updates, HTTPS routing and phone/redeploy checks.
- Local Docker daemon is unavailable, so the container build and live deployment have not been verified. Source checks are run separately.

## Provider decision

- User selected CommandCode Provider API with an OpenAI model; default planned model is gpt-5.5.
- Updated .env.example, README and backend/Dokploy handoffs with CMD_API_KEY, AI_BASE_URL and AI_MODEL.
- Configuration documentation only: no model calls, credential validation or live vision/tool tests implemented by this change. Health remains agent: not_configured.

## Next owners

- Frontend: create/join and real photo/question UI flows are complete. Test camera/image upload on the physical phones before the demo; then integrate later task UI only after its contract is available.
- Backend: real agent loop and task transitions after model credentials are configured.

Update this file with actual test results and PR links. Do not describe fixture data as a working agent.
