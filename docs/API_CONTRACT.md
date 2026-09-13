# API contract v0.1

Source of truth: `shared/contracts.ts`. Base path `/api`, same origin as the web app. All API responses use `Cache-Control: no-store`.

## Implemented now

| Method / path | Body | Response | Access |
|---|---|---|---|
| GET `/health` | None | HealthResponse | Public |
| POST `/sessions` | CreateSessionInput, e.g. `{ "title": "Workshop" }` | 201 CreateSessionResponse | Creates a new host credential |
| POST `/sessions/:code/join` | JoinSessionInput, e.g. `{ "name": "Ali", "zone": "Meja Bekalan" }` | 201 JoinSessionResponse | Valid invite code |
| GET `/sessions/:code` | None | GetSessionResponse | Bearer hostToken or participantToken |

Create returns `hostToken` once. Join returns the new participant's `participantId` and `participantToken` once. Keep the relevant credential in the caller's browser storage per session; never embed it in shared URLs. Reload resumes by GET with the saved token, not by POSTing a new join each time.

All reads return the same session-wide view to a host or joined participant. This is a shared-room prototype, not a private per-person feed. A participant token from another session is rejected. Tokens are hashed in server storage and omitted from session snapshots.

Codes are case-insensitive. Session snapshots include `revision` and timestamps. Start with a foreground-only GET poll every two seconds, cancel on unmount, and show connection errors. SSE/WebSockets are not implemented.

Health explicitly reports `agent: "not_configured"`. Empty arrays mean no real observations or tasks exist, not a fabricated successful run.

## Planned next: do not call these as working endpoints yet

These return 404 in the starter. The backend owner implements them against this plan and updates this document before integration.

| Method / path | Proposed request | Success response | Access / behavior |
|---|---|---|---|
| POST `/sessions/:code/missions` | CreateMissionInput | GetSessionResponse | Host; one active mission |
| POST `/sessions/:code/requests` | CreateRequestInput | GetSessionResponse | Host/agent; target a participant in this session |
| POST `/sessions/:code/media` | Multipart field `image`, JPEG/PNG/WebP, max 5 MB | `{ mediaId: string }` | Joined participant; ownership and session enforced |
| GET `/sessions/:code/media/:mediaId` | None | Image bytes | Session token required; frontend uses authenticated fetch + blob URL |
| POST `/sessions/:code/observations` | SubmitObservationInput | GetSessionResponse | Only the participant assigned to that request |
| POST `/sessions/:code/tasks/:taskId/respond` | RespondToTaskInput | GetSessionResponse | Only the offered/assigned participant |

For planned mutations use an `Idempotency-Key` header generated once per logical submission and reused on retry. The backend must enforce deduplication before declaring those mutations ready. The current create/join endpoints do not yet implement idempotency; disable repeated clicks, and do not automatically retry a failed/uncertain POST.

Observations keep original text/media references, source participant, zone and receipt timestamp. A receipt timestamp is not proof of when the photo was taken. Missing/unclear visual evidence must remain uncertain.

Participant `report_done` transitions a task to `needs_verification`; it cannot directly mark a task or whole mission verified/completed. Declined tasks remain declined. The agent may propose another task; it cannot pretend the original was accepted.

## Errors

```json
{ "error": { "code": "UNAUTHORIZED", "message": "A valid session token is required." } }
```

Implemented errors: INVALID_INPUT (400), INVALID_JSON (400), UNAUTHORIZED (401), SESSION_NOT_FOUND (404), NOT_FOUND (404), SESSION_FULL (409), PAYLOAD_TOO_LARGE (413), INTERNAL_ERROR (500).

Use `ApiError` from web/src/api.ts. Do not display successful UI state after a rejected request.

## Frontend previews

Use shared/fixtures.ts in an explicitly labeled development mode. Production-like flows must use real endpoints as they become available. Fixtures must never be submitted as evidence that the agent or photo inspection works.
