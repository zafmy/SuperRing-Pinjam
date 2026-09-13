# Backend handoff

Owner: zafmy + assistant. Branch: `feat/backend`.

The session create/join/read foundation is in main. Implement the next vertical slice without replacing the frontend owner's UI.

1. Implement authorized photo/question requests, media upload and participant observations against API_CONTRACT.md. Enforce ownership and idempotency for new mutations. Keep image limits and MIME validation explicit.
2. Verify request → phone observation → shared snapshot before adding model calls.
3. Add a model with image input and constrained tools. Check current official provider docs and configure credentials server-side. Model choice is not locked by this starter.
4. Implement one agent step per relevant new event. Persist pending human requests and return; resume after a response. Cap automatic actions and surface failures.
5. Implement task offer/accept/decline/report_done and verification transitions. A photo omission is uncertainty, not proof of absence.
6. Add tests for cross-session/participant access, repeated submissions, rejected tasks, stale observations and unverified completion.
7. Integrate with the frontend owner, then deploy one server with persistent data for both phones.

Current JSON storage is intentionally a small single-process foundation. Move to a transactional database if hosting requires more than one process or ephemeral storage. Do not advertise concurrent multi-instance safety.
