# PINJAM · SuperRing

PINJAM is a hackathon prototype for an agent that asks people in a shared space to observe, help and verify physical work through their phones.

Our first mission: prepare a workshop table for three participants, with a notebook, pen and name tag for each person. Two volunteers join one session from different locations. The intended agent asks for photos, offers tasks, adapts to a declined task or missing item, and checks the result.

## Current status

**Mission/evidence UI, automatic agent controls, reset and phone push are implemented.** Hosts can confirm a mission, start automatic coordination, monitor progress, stop it and reset for a replacement mission without replacing participant links. Participants receive requests and voluntary tasks; the agent resumes after relevant input and checks fresh evidence before completion.

Web Push supports notifications when the page is closed after the participant enables them in a supported browser. iPhone users must use the Home Screen app. An in-app notification list remains available. Follow [the deployment and phone test guide](docs/AUTOMATION_AND_PUSH.md).

Automated model/push tests pass; live CommandCode vision/tool behavior and real phone delivery still require verification. Each automatic run is bounded by steps and 20 minutes, pauses on provider errors, and stops after a server restart until the host resumes.

## Run locally

Use Node.js 22.12 or newer and npm. Both teammates use the same committed lockfile.

```sh
git clone https://github.com/zafmy/SuperRing-Pinjam.git
cd SuperRing-Pinjam
npm ci
npm run dev
```

Open http://localhost:5173. The web server forwards `/api` to the backend on port 3001. No model key is required for the starter.

Optional configuration: copy `.env.example` to `.env`. For normal development keep `PORT=3001`, matching the Vite proxy. The agent uses CommandCode Provider API with OpenAI model `gpt-5.5`. `.env.example` includes CMD_API_KEY, AI_BASE_URL and AI_MODEL settings consumed by the backend. Configure the real key only on the backend; never put keys in `VITE_*` variables.

```sh
npm run check
npm run build
npm start
```

The production build serves both the browser app and API on port 3001 (or `PORT`). Hosting needs one persistent Node process and persistent storage for `DATA_DIR`; this starter's JSON store is not suitable for multi-instance/serverless deployment. A public HTTPS deployment or appropriately configured tunnel is needed for a remote phone demo. A Dockerfile and [Dokploy setup guide](docs/DOKPLOY.md) are included; a live deployment still needs verification.

For local network testing, open the laptop's LAN address on port 5173 from both phones while `npm run dev` is running, subject to Wi-Fi isolation/firewall rules. Both must use the same backend and session. Test camera/upload behavior on the actual phones before relying on it.

## Two people, one project

| Owner | Branch | Files |
|---|---|---|
| zafmy + assistant | `feat/backend` | `server/**`, tooling and integration |
| Frontend teammate | `feat/frontend` | `web/**` |
| Agreed together | Via small PR | `shared/**`, API contract |

Start feature branches from `main` after pulling the starter. Only the owner starts `feat/backend`; only the frontend teammate starts `feat/frontend`. Do not edit the same branch from both computers.

- [Frontend handoff and ready-to-use prompt](docs/FRONTEND_HANDOFF.md)
- [Team workflow](docs/TEAM_WORKFLOW.md)
- [API contract: implemented versus planned](docs/API_CONTRACT.md)
- [Four-hour build plan](docs/BUILD_PLAN.md)
- [Backend next steps](docs/BACKEND_HANDOFF.md)

## Layout

```text
web/                  React + Vite; frontend owner
web/src/api.ts        Typed client for implemented endpoints
server/               Express + TypeScript; backend owner
shared/contracts.ts   Shared types and agreed input shapes
shared/fixtures.ts    Explicit demo data for UI development
docs/                 Plan, ownership, contract and status
.data/                Local state, gitignored
```

The app intentionally has no generated photos or simulated successful agent runs. Build and test the core functionality during the official event; describe its actual limits in the submission.
