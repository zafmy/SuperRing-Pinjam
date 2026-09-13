# Backend handoff

Owner: zafmy + assistant. Branch: `feat/backend`.

Session create/join/read and the evidence workflow are implemented. See STATUS.md and the PR state before assuming a change has reached main. Continue without replacing the frontend owner's UI.

1. Done at API level: authorized photo/question requests, media upload/retrieval, participant observations and confirmed missions. New mutations enforce ownership/idempotency; uploads enforce byte limits and inspect file signatures.
2. Verify request → physical phone observation → shared snapshot with the frontend owner. Eleven backend integration tests pass; physical-phone testing remains outstanding.
3. Add a model with image input and constrained tools. Check current official provider docs and configure credentials server-side. The user selected CommandCode Provider API with an OpenAI model. Use CMD_API_KEY, AI_BASE_URL=https://api.commandcode.ai/provider/v1 and AI_MODEL=gpt-5.5; call /chat/completions. Do not default to a direct OpenAI endpoint. These variables are currently preparation only: implement and test the runner before reporting AI as active. Verify image input and tool calls through the actual account.
4. Implement one agent step per relevant new event. Persist pending human requests and return; resume after a response. Cap automatic actions and surface failures.
5. Implement task offer/accept/decline/report_done and verification transitions. A photo omission is uncertainty, not proof of absence.
6. Add tests for cross-session/participant access, repeated submissions, rejected tasks, stale observations and unverified completion.
7. Integrate with the frontend owner, then deploy one server with persistent data for both phones.

Current JSON storage is intentionally a small single-process foundation. Move to a transactional database if hosting requires more than one process or ephemeral storage. Do not advertise concurrent multi-instance safety.

Agent integration note: server storage keeps host credentials hashed. Do not try to recover the host bearer token or grant host HTTP rights to a participant. Add an internal session-scoped agent action path used only by the authorized runner, while retaining host/participant checks at the public API boundary.
