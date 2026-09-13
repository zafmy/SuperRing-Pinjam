# API contract v0.2

Source of truth: `shared/contracts.ts`. Base path `/api`, same origin as the web app. All API responses use `Cache-Control: no-store`.

## Implemented now

| Method / path | Body | Response | Access |
|---|---|---|---|
| GET `/health` | None | HealthResponse | Public |
| POST `/sessions` | CreateSessionInput, e.g. `{ "title": "Workshop" }` | 201 CreateSessionResponse | Creates a new host credential |
| POST `/sessions/:code/join` | JoinSessionInput, e.g. `{ "name": "Ali", "zone": "Meja Bekalan" }` | 201 JoinSessionResponse | Valid invite code |
| GET `/sessions/:code` | None | GetSessionResponse | Bearer hostToken or participantToken |
| POST `/sessions/:code/missions` | CreateMissionInput | 201 GetSessionResponse | Host + Idempotency-Key; one mission per session in this prototype |
| POST `/sessions/:code/requests` | CreateRequestInput | 201 GetSessionResponse | Host + Idempotency-Key; participant must belong to this session |
| POST `/sessions/:code/media` | Multipart field `image`, JPEG/PNG/WebP, max 5 MiB | 201 `{ mediaId: string }` | Participant + Idempotency-Key |
| GET `/sessions/:code/media/:mediaId` | None | Image bytes | Any host/joined participant in the same session |
| POST `/sessions/:code/observations` | SubmitObservationInput | 201 GetSessionResponse | Requested participant + Idempotency-Key |

Create returns `hostToken` once. Join returns the new participant's `participantId` and `participantToken` once. Keep the relevant credential in the caller's browser storage per session; never embed it in shared URLs. Reload resumes by GET with the saved token, not by POSTing a new join each time.

All reads return the same session-wide view to a host or joined participant. This is a shared-room prototype, not a private per-person feed. A participant token from another session is rejected. Tokens are hashed in server storage and omitted from session snapshots.

Codes are case-insensitive. Session snapshots include `revision` and timestamps. Start with a foreground-only GET poll every two seconds, cancel on unmount, and show connection errors. SSE/WebSockets are not implemented.

Health explicitly reports `agent: "not_configured"`. Empty arrays mean no real observations or tasks exist, not a fabricated successful run.

## Evidence workflow: implemented

1. The host can optionally confirm a mission using CreateMissionInput. Requirement IDs must be unique, quantities are positive integers, and this prototype accepts one mission per session. A host can also request observations before setting a mission, to test the image flow independently.
2. The host posts CreateRequestInput. The participant sees the pending request in the next session snapshot. These requests are host-issued until model integration is implemented.
3. For a photo request, the assigned participant uploads one file under multipart field `image` and receives `mediaId`. Upload uses the participant token, not the host token. Do not manually set multipart Content-Type; the browser sets its boundary.
4. The participant posts `{ requestId, text, mediaId }`. A text-only question response uses `mediaId: null`. Photo requests require an image. An empty response is rejected.
5. The response appears in `session.observations`; the request becomes `answered`. Participant identity and zone come from the server record, never client-supplied attribution. This is evidence receipt, not AI verification or mission completion.
6. To display an image, use authenticated fetch on the media GET route, turn the response into a blob URL, and revoke that URL when no longer used. A plain image URL without an Authorization header cannot access the file.

An image can only be attached by its uploading participant and to one observation. New requests require new uploads; the service cannot prove physical capture time. Snapshots expose media IDs, not file paths, upload credentials, or private storage metadata.

Uploads allow one JPEG/PNG/WebP file, up to 5 MiB (5,242,880 bytes), and no extra multipart fields. The file signature is inspected instead of trusting the extension or declared MIME type. This does not constitute full image decoding or semantic verification. Unsupported/corrupt image processing remains an explicit model-stage failure to handle later. Each session has a 50 MiB stored-image budget.

## Retry behavior

For mission/request/media/observation POSTs, send an `Idempotency-Key` generated once per logical action and reuse it after an uncertain network response. Use a UUID; accepted keys are 8–128 letters, numbers, dots, colons, underscores or hyphens. Missing keys return 400.

Deduplication is scoped to session, caller and operation, and persists across restarts. Retrying identical normalized input does not create new records/events or advance revision. Media retries return the same mediaId. Other retries return the latest session snapshot, which may include subsequent work. Reusing the key with different input returns 409 IDEMPOTENCY_CONFLICT. Attempting to answer an already closed request with a new key returns 409 REQUEST_CLOSED.

The existing create-session and join-session endpoints still do not implement idempotency. Disable repeated clicks and do not automatically retry uncertain create/join POSTs.

## Planned next: do not call these as working endpoints yet

These return 404 in the starter. The backend owner implements them against this plan and updates this document before integration.

| Method / path | Proposed request | Success response | Access / behavior |
|---|---|---|---|
| POST `/sessions/:code/tasks/:taskId/respond` | RespondToTaskInput | GetSessionResponse | Only the offered/assigned participant |

Future task mutations must implement the same idempotency convention before being marked ready.

Observations keep original text/media references, source participant, zone and receipt timestamp. A receipt timestamp is not proof of when the photo was taken. Missing/unclear visual evidence must remain uncertain.

Participant `report_done` transitions a task to `needs_verification`; it cannot directly mark a task or whole mission verified/completed. Declined tasks remain declined. The agent may propose another task; it cannot pretend the original was accepted.

## Errors

```json
{ "error": { "code": "UNAUTHORIZED", "message": "A valid session token is required." } }
```

Implemented errors: INVALID_INPUT (400), INVALID_JSON (400), UNAUTHORIZED (401), SESSION_NOT_FOUND (404), NOT_FOUND (404), SESSION_FULL (409), PAYLOAD_TOO_LARGE (413), INTERNAL_ERROR (500).

Evidence errors: IDEMPOTENCY_KEY_REQUIRED / IMAGE_REQUIRED / EMPTY_OBSERVATION / INVALID_UPLOAD (400), FORBIDDEN (403), PARTICIPANT_NOT_FOUND / REQUEST_NOT_FOUND / MEDIA_NOT_FOUND (404), IDEMPOTENCY_CONFLICT / MISSION_EXISTS / REQUEST_CLOSED / MEDIA_ALREADY_USED (409), MEDIA_QUOTA_EXCEEDED (413), UNSUPPORTED_IMAGE (415).

Use `ApiError` from web/src/api.ts. Do not display successful UI state after a rejected request.

## Frontend previews

Use shared/fixtures.ts in an explicitly labeled development mode. Session, mission and evidence flows can now use real APIs. Tasks and model output remain fixtures until implemented and must never be presented as a real agent run.

## Frontend integration note

No public fields or existing endpoint payloads changed in v0.2. The frontend owner can add methods to web/src/api.ts for the newly implemented routes. For JSON requests send Authorization, Content-Type: application/json and Idempotency-Key. For image upload send Authorization and Idempotency-Key with a FormData body; use a separate request helper so the current JSON helper does not set the wrong Content-Type.
