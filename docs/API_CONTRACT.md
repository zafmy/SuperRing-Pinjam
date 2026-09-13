# API contract v0.4

Source of truth: `shared/contracts.ts`. Base path `/api`, same origin as the web app. All API responses use `Cache-Control: no-store`.

## Implemented now

| Method / path | Body | Response | Access |
|---|---|---|---|
| GET `/health` | None | HealthResponse | Public |
| POST `/sessions` | CreateSessionInput, e.g. `{ "title": "Workshop" }` | 201 CreateSessionResponse | Creates a new host credential |
| POST `/sessions/:code/join` | JoinSessionInput, e.g. `{ "name": "Ali", "zone": "Meja Bekalan" }` | 201 JoinSessionResponse | Valid invite code |
| GET `/sessions/:code` | None | GetSessionResponse | Bearer hostToken or participantToken |
| POST `/sessions/:code/missions` | CreateMissionInput | 201 GetSessionResponse | Host + Idempotency-Key; one active mission per session; reset supported |
| POST `/sessions/:code/requests` | CreateRequestInput | 201 GetSessionResponse | Host + Idempotency-Key; participant must belong to this session |
| POST `/sessions/:code/media` | Multipart field `image`, JPEG/PNG/WebP, max 5 MiB | 201 `{ mediaId: string }` | Participant + Idempotency-Key |
| GET `/sessions/:code/media/:mediaId` | None | Image bytes | Any host/joined participant in the same session |
| POST `/sessions/:code/observations` | SubmitObservationInput | 201 GetSessionResponse | Requested participant + Idempotency-Key |

Create returns `hostToken` once. Join returns the new participant's `participantId` and `participantToken` once. Keep the relevant credential in the caller's browser storage per session; never embed it in shared URLs. Reload resumes by GET with the saved token, not by POSTing a new join each time.

All reads return the same session-wide view to a host or joined participant. This is a shared-room prototype, not a private per-person feed. A participant token from another session is rejected. Tokens are hashed in server storage and omitted from session snapshots.

Codes are case-insensitive. Session snapshots include `revision` and timestamps. Start with a foreground-only GET poll every two seconds, cancel on unmount, and show connection errors. SSE/WebSockets are not implemented.

Health reports `agent: "configured"` when the backend has CommandCode configuration, otherwise `"not_configured"`. Configured is not a live provider check. Empty arrays mean no real observations or tasks exist, not a fabricated successful run.

## Evidence workflow: implemented

1. The host can optionally confirm a mission using CreateMissionInput. Requirement IDs must be unique, quantities are positive integers, and this prototype accepts one active mission per session. A host can also request observations before setting a mission, to test the image flow independently.
2. The host posts CreateRequestInput. The participant sees the pending request in the next session snapshot. Requests may be issued manually by the host or by a validated model action.
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

## Agent and task workflow: implemented

| Method / path | Body | Response | Access |
|---|---|---|---|
| POST `/sessions/:code/agent/step` | Empty body or `{}` | 200 AgentStepResult | Host bearer token + Idempotency-Key |
| POST `/sessions/:code/tasks/:taskId/respond` | RespondToTaskInput | 200 GetSessionResponse | Assigned participant bearer token + Idempotency-Key |

The host creates and confirms the mission FIRST using the existing missions endpoint. At least one participant must have joined before an agent step. One active mission per session; the host may reset and then confirm a new mission. `mission.status: active` means the mission was saved, not that a background agent is running.

Each explicit host click runs **one** CommandCode model decision, with a 60-second provider timeout. The frontend must not call this in an effect, polling loop, or automatic retry loop. After a participant responds, show “Langkah agent seterusnya”. For automatic continuation, start the server worker using the start endpoint below. Manual steps return AUTOMATION_ACTIVE while automatic mode is enabled. A model decision can request a photo/question, offer a task, verify a reported task, complete the mission, or wait. AgentStepResult contains `{ session, action, summary }`; show the factual summary, never a fabricated reasoning trace.

Persist/reuse one idempotency key for the same logical step after an uncertain response. Successful steps are recorded on disk; retrying a successful key returns its action/summary plus the current snapshot without calling the model again. Failed provider calls may be called again and charged again on retry. Concurrent steps in one session return AGENT_BUSY; wait then retry. If the session changes while the model runs, AGENT_STALE discards its decision; a new step must use the latest snapshot. Never replace a newer session revision with an older one.

Participant transitions:
- offered → accept → accepted
- offered/accepted/in_progress → decline → declined (optional note explains obstacle)
- accepted → start → in_progress
- accepted/in_progress → report_done → needs_verification

Declined tasks cannot be accepted later; the agent must offer another task. Participants cannot mark tasks completed. Agent verification requires a newer photo than the report-done timestamp, actually supplied to the model. Final mission completion requires all tasks resolved, all requirement IDs covered, no pending requests and a final photo newer than the last task state change. Semantic accuracy still depends on the model; receipt time does not prove capture time.

New errors: AGENT_NOT_CONFIGURED (503), MISSION_REQUIRED / PARTICIPANTS_REQUIRED / MISSION_COMPLETED / AGENT_BUSY / AGENT_STALE / INVALID_TASK_TRANSITION (409), AGENT_ACTION_REJECTED (422), AGENT_UNAVAILABLE / AGENT_PROVIDER_ERROR / AGENT_RATE_LIMITED / AGENT_INVALID_OUTPUT (502), TASK_NOT_FOUND (404). Display the error without claiming success. HTTP 502 messages distinguish provider/network failures; provider credentials and raw upstream error bodies are not exposed.

SessionEvent.kind now also permits `agent_step`. Existing fields/endpoints are unchanged; HealthResponse adds `configured`, and AgentStepResult is a new shared type.

Observations keep original text/media references, source participant, zone and receipt timestamp. A receipt timestamp is not proof of when the photo was taken. Missing/unclear visual evidence must remain uncertain.

Participant `report_done` transitions a task to `needs_verification`; it cannot directly mark a task or whole mission verified/completed. Declined tasks remain declined. The agent may propose another task; it cannot pretend the original was accepted.

## Reset, automatic mode and monitoring

| Method / path | Body | Response | Access |
|---|---|---|---|
| POST `/sessions/:code/missions/reset` | `{missionId}` | GetSessionResponse | Host + Idempotency-Key |
| POST `/sessions/:code/agent/start` | `{missionId, maxSteps?: number}` | GetSessionResponse | Host + Idempotency-Key |
| POST `/sessions/:code/agent/stop` | `{missionId}` | GetSessionResponse | Host + Idempotency-Key |

Start defaults to 30 steps, accepts integers 1–100, and allows at most 20 minutes per run. One runner owns all manual and automatic calls in this Node process; each session has at most one call in flight. No browser polling or open tab is needed for automatic progress. After request/offer/wait, the model is not called again until participants, observations, tasks, mission or requests change. Events, monitor updates and notification reads do not trigger model calls. Verification may proceed directly to another step. Errors pause the run without unlimited retries. Stale results are discarded and retried within the remaining step limit.

GET session includes optional `automation: AutomationState` for monitoring: runId, missionId, enabled, status, steps, maxSteps, startedAt, updatedAt, deadlineAt, message. Steps counts attempted steps, including stale/failed work, not billable token usage. Status is running/waiting/stopped/completed/error/limit_reached. Completion turns enabled off. Restart/redeploy pauses previously active runs with a visible restart message; the host explicitly starts another run. No host bearer token is stored for the worker.

Stop aborts the network request where possible and invalidates late results. It does not revoke already accepted physical work, and provider charges already incurred cannot be undone. Reset also aborts any call for that mission, archives the old public mission view inside sessions.json, and clears active requests, observations, tasks and events. Participants, invite code, credentials and push subscriptions remain. Images and prior step retry receipts remain on disk; reset does not free the existing 50 MiB session image quota. There is no archive browsing UI yet.

MissionId prevents a delayed reset from clearing a replacement mission. Reusing a successful reset/start/stop key returns the current snapshot without replaying the action; a new run needs a new key. Scope browser pending manual-step keys to mission ID. Existing session fields remain valid; automation is optional for older data.

New errors: MISSION_CHANGED, AUTOMATION_ACTIVE, AGENT_STOPPED (409). Event kinds additionally include mission_reset and automation_changed.

## Phone notifications (Web Push)

All routes below require the relevant host/participant bearer token. No Idempotency-Key is needed; subscribe is an upsert for the caller/device and unsubscribe is idempotent.

| Method / path | Body | Response |
|---|---|---|
| GET `/sessions/:code/push/config` | None | `{enabled, publicKey}` |
| POST `/sessions/:code/push/subscribe` | PushSubscription JSON with endpoint and keys | `{subscribed:true}` |
| POST `/sessions/:code/push/unsubscribe` | `{endpoint}` | `{subscribed:false}` |
| POST `/sessions/:code/push/status` | `{endpoint}` | `{subscribed,lastError,lastSentAt}` |
| POST `/sessions/:code/push/test` | `{endpoint}` | `{accepted:true}` |

Service worker /sw.js shows notifications and opens a token-free session link. Browser permission is requested only by an explicit enable click. A PWA manifest and icons support Home Screen installation. Participant pushes cover assigned requests/tasks and mission reset/creation/completion; host pushes cover responses, tasks and automation problems. Lock-screen messages contain generic text; private instructions are read inside the authenticated app. There is also an in-app unread list and tab count.

Server-generated VAPID keys and caller-scoped subscriptions persist in DATA_DIR, outside public snapshots. Never delete that volume on redeploy. Subscribers start from current state (historical alerts are not replayed). New notices are deduplicated, transient failures retry up to three times, and 404/410 endpoints are removed. Delivery is at-least-once on uncertain network responses; stable notification tags collapse duplicates on supporting devices. No end-to-end delivery guarantee is implied by accepted:true. Browser/OS permissions, device connectivity and battery policies affect delivery. Pending pushes expire after 20 minutes.

Endpoint registration accepts known HTTPS browser push providers only (Google FCM, Apple, Mozilla and Windows); arbitrary URLs, credentials in URLs and custom ports are rejected. Encryption keys must have the expected lengths. Maximum five subscriptions per caller/session. Test sends are limited to one per 30 seconds. Errors: PUSH_NOT_CONFIGURED (503), PUSH_NOT_SUBSCRIBED (404), PUSH_LIMIT (409), PUSH_TEST_LIMIT (429), PUSH_FAILED (502); invalid subscriptions return INVALID_INPUT (400).

## Errors

```json
{ "error": { "code": "UNAUTHORIZED", "message": "A valid session token is required." } }
```

Implemented errors: INVALID_INPUT (400), INVALID_JSON (400), UNAUTHORIZED (401), SESSION_NOT_FOUND (404), NOT_FOUND (404), SESSION_FULL (409), PAYLOAD_TOO_LARGE (413), INTERNAL_ERROR (500).

Evidence errors: IDEMPOTENCY_KEY_REQUIRED / IMAGE_REQUIRED / EMPTY_OBSERVATION / INVALID_UPLOAD (400), FORBIDDEN (403), PARTICIPANT_NOT_FOUND / REQUEST_NOT_FOUND / MEDIA_NOT_FOUND (404), IDEMPOTENCY_CONFLICT / MISSION_EXISTS / REQUEST_CLOSED / MEDIA_ALREADY_USED (409), MEDIA_QUOTA_EXCEEDED (413), UNSUPPORTED_IMAGE (415).

Use `ApiError` from web/src/api.ts. Do not display successful UI state after a rejected request.

## Frontend previews

Use shared/fixtures.ts in an explicitly labeled development mode. Session, mission and evidence flows can now use real APIs. Use real agent/task endpoints after deployment; fixtures must never be presented as a real agent run. Live model vision/tool behavior remains to be verified with the account key.

## Frontend integration note

No public fields or existing endpoint payloads changed in v0.2. The frontend owner can add methods to web/src/api.ts for the newly implemented routes. For JSON requests send Authorization, Content-Type: application/json and Idempotency-Key. For image upload send Authorization and Idempotency-Key with a FormData body; use a separate request helper so the current JSON helper does not set the wrong Content-Type.

## Host removes a participant (additive)

`POST /api/sessions/:code/participants/:participantId/remove` requires the host bearer token and `Idempotency-Key`; body `{}`. Returns `{ session }`. Participant callers receive 403; unknown participant IDs receive 404. A successful retry with the same key is safe.

Removes active membership and revokes its token immediately (subsequent access returns 401), cancels pending requests and unfinished tasks, and records `participant_removed`. Existing evidence and completed history remain. Queued push subscriptions are purged; already delivered notifications cannot be recalled. In-flight agent decisions from the old revision are rejected. Automatic mode replans for remaining participants or waits for a new join when none remain. The invitation code remains valid, so joining again creates a new identity.
