# Deploy PINJAM on Dokploy

## Application settings

1. Create a project and an Application named `pinjam`.
2. Select GitHub repository `zafmy/SuperRing-Pinjam`, branch `main` (or Git source `https://github.com/zafmy/SuperRing-Pinjam.git`).
3. Select Dockerfile build type, Dockerfile path `Dockerfile`, build context `.` at repository root. The image runs checks and builds the web app and API together. Do not override its start command or run the development server.
4. Set environment variables:

```env
NODE_ENV=production
PORT=3001
DATA_DIR=/app/.data
```

The chosen provider for the agent is CommandCode Provider API, using OpenAI model `gpt-5.5`. Prepare these runtime variables in Dokploy Environment:

```env
CMD_API_KEY=your_commandcode_key
AI_BASE_URL=https://api.commandcode.ai/provider/v1
AI_MODEL=gpt-5.5
```

Replace the placeholder only in Dokploy, never in Git, build arguments or `VITE_*` variables. No direct OpenAI API key is needed. The backend now consumes these variables. A configured key enables manual and automatic agent controls in the integrated frontend. No model call runs on startup.

The client uses `/chat/completions` with Bearer authentication. CommandCode documents text and image inputs; account/model access, image input and tool calls still require a live integration test. Its Go plan does not include Provider API access. See [Provider API](https://commandcode.ai/docs/provider) and [model catalog](https://commandcode.ai/docs/reference/cli/models).

5. Before first deployment, Advanced → Volumes: add a named volume, name `pinjam-data`, container mount path `/app/.data`. Retain the same volume across deployments. The container runs as Node user UID/GID 1000; an existing volume must be writable by that user. Do not mount over `/app`.
6. Keep replicas at **1** on the same server. Use stop-first update and rollback order, parallelism 1; do not enable start-first/overlapping zero-downtime updates. The JSON store assumes one writer. Moving to another server requires migrating its volume.
7. Domains: add your chosen hostname, path `/`, container port `3001`, HTTPS enabled with a valid certificate. Point DNS at your server. Both UI and `/api` use this same domain; no separate frontend service is needed.
8. Deploy. Wait for the build and container health to succeed. The first build installs development dependencies for TypeScript/Vite; the final image contains production dependencies only.

## Verify before the demo

- Open `/api/health`: expect `ok: true` and `agent: "configured"` when CMD_API_KEY is present, otherwise `"not_configured"`. Configured does not validate the key with CommandCode.
- Open the root URL on the laptop, create a host session, then open its invite URL on two phones. Confirm both participants appear.
- Send a photo request, upload a JPEG/PNG/WebP up to 5 MiB, and confirm the host can see it. Test an actual camera image; select a smaller supported image if the phone provides HEIC or a file above the limit.
- Reload each device: its session should recover without rejoining.
- Restart/redeploy the application while retaining the volume. Reload the same devices and verify both session and image remain available. A successful health response alone does not verify persistence or phone uploads.

The image has not been built locally if Docker is unavailable; Dokploy's build is the container validation checkpoint. Do not present a successful local source build as a tested deployment.

Official references: [Applications](https://docs.dokploy.com/docs/core/applications), [Domains](https://docs.dokploy.com/docs/core/domains).

## Automatic agent and phone push

See [AUTOMATION_AND_PUSH.md](AUTOMATION_AND_PUSH.md). The server generates VAPID keys in DATA_DIR on first startup and retains subscriptions there. Keep that volume. HTTPS is required for phone push; iPhone users enable notifications from the installed Home Screen web app. Optional VAPID_SUBJECT sets the team's contact URL or mailto address; its default is the project repository URL.

Stop-first/single-replica remains required. Restart/redeploy pauses active automation with a visible message. The host resumes explicitly. Test real closed-app notification delivery on each phone before the demo.
