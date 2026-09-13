# PINJAM team instructions

This is a two-person hackathon project. Read README.md, docs/TEAM_WORKFLOW.md and docs/API_CONTRACT.md before implementation.

## Ownership

- Backend owner (zafmy and their coding assistant): `server/**`, root tooling, dependency manifests, deployment and integration.
- Frontend teammate: `web/**`. The starter UI is intentionally temporary; implement the participant and host experience here.
- Shared: `shared/**` and `docs/API_CONTRACT.md`. Treat these as the agreed integration boundary. Record proposed contract changes and coordinate with the other owner before introducing incompatible changes.
- Do not spawn additional agents by default. Human teammates are working independently.

## Work rules

- Work on the assigned feature branch and submit small pull requests to `main`. Do not force-push or overwrite another person's work.
- Use `shared/contracts.ts`; do not invent conflicting copies of types or endpoint paths.
- Frontend can use `shared/fixtures.ts` for explicit development previews. Never present fixtures as real observations or agent runs.
- Keep provider credentials and session tokens out of the browser bundle, logs and git. Participant/host session tokens are returned to their holder only and must not appear in QR URLs or public session snapshots.
- Session create/join/read, host-confirmed missions, observation requests, image upload/retrieval and participant responses are implemented. Manual/automatic agent steps, task responses, reset, monitoring UI and Web Push are implemented. Live provider and real phone push verification remain outstanding. Read docs/STATUS.md for the latest verified checkpoint.
- Use one backend for a multi-phone demo. Current JSON storage assumes a single Node process and a persistent data directory.
- Keep the product scoped to one workshop-table setup mission with two locations and two participants.
- Explain uncertainty in images and allow clarification. Do not infer that an unseen item is definitely absent or let a participant mark a mission verified.
- Run `npm run check` for code changes. Add meaningful tests for state transitions and access rules as those capabilities are implemented.
- Update docs/STATUS.md with verified progress, limitations and handoff notes.
