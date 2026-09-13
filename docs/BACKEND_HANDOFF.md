# Latest backend checkpoint

AgentRunner in server/automation.ts now owns manual/automatic execution and stop/reset cancellation. Worker access is server-internal and scoped to a persisted runId/missionId; public control routes remain host-only. PushService uses separate persisted VAPID/subscription files and does not expose them in session snapshots. Refer to API_CONTRACT.md v0.4 and AUTOMATION_AND_PUSH.md. The old manual-only design notes below are historical.

# Backend handoff

Implemented: sessions, evidence, confirmed missions, host-triggered CommandCode agent steps and participant task transitions. See API_CONTRACT.md v0.3 and MISSION_AGENT_HANDOFF.md for frontend integration.

Provider configuration: CMD_API_KEY, AI_BASE_URL=https://api.commandcode.ai/provider/v1, AI_MODEL=gpt-5.5. No direct OpenAI key or endpoint. The adapter accepts one validated tool action per explicit host request, sends at most six recent images, rejects stale decisions and persists successful step keys. There is no background worker or automatic continuation.

Next: configure the key in Dokploy, deploy, merge the frontend mission/agent controls, then test real vision/tool calls and the two-phone decline/replan/fresh-verification demo. Automated tests inject a planner/HTTP transport and do not prove live provider compatibility. Source tests cover authorization, retry persistence, concurrent steps, stale snapshots, refusal, and verification gates.

The JSON store requires one Node process, a persistent volume and stop-first deployment. Host tokens stay hashed on disk; no token recovery is needed because each step is explicitly authorized by the host request. Participant responses never receive host privileges. Any future background runner needs a separate internal authorization design.
