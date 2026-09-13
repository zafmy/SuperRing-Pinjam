import { z } from 'zod';

const text = z.string().trim().min(1).max(2000);
const ids = z.array(z.string().uuid()).min(1).max(20);
export const agentDecision = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), participantId: z.string().uuid(), kind: z.enum(['photo', 'question']), prompt: text, summary: text }),
  z.object({ action: z.literal('offer_task'), participantId: z.string().uuid(), title: text, sourceObservationIds: ids, summary: text }),
  z.object({ action: z.literal('verify_task'), taskId: z.string().uuid(), sourceObservationIds: ids, summary: text }),
  z.object({ action: z.literal('complete_mission'), sourceObservationIds: ids, requirementIds: z.array(z.string()).min(1).max(20), summary: text }),
  z.object({ action: z.literal('wait'), summary: text }),
]);
export type AgentDecision = z.infer<typeof agentDecision>;
