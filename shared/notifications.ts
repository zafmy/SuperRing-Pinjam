import type { SessionView } from './contracts';
export interface SessionNotice { id: string; title: string; body: string }
export function sessionNotices(session: SessionView, participantId?: string): SessionNotice[] {
  const notices: SessionNotice[] = [];
  if (participantId) {
    for (const request of session.requests) {
      if (request.participantId === participantId && request.status === 'pending') notices.push({ id: `request:${request.id}`, title: request.kind === 'photo' ? 'Gambar diperlukan' : 'Jawapan diperlukan', body: request.prompt });
    }
    for (const task of session.tasks) {
      if (task.participantId === participantId && ['offered', 'completed', 'cancelled'].includes(task.status)) notices.push({ id: `task:${task.id}:${task.status}`, title: task.status === 'offered' ? 'Tugasan baharu untuk anda' : task.status === 'completed' ? 'Tugasan disahkan siap' : 'Tugasan dibatalkan', body: task.title });
    }
  } else {
    for (const event of session.events) if (['observation_added', 'task_updated', 'agent_error'].includes(event.kind)) notices.push({ id: event.id, title: event.kind === 'agent_error' ? 'Agent perlukan perhatian' : 'Kemas kini peserta dan tugasan', body: event.summary });
    const auto = session.automation;
    if (auto && ['error', 'limit_reached', 'stopped'].includes(auto.status)) notices.push({ id: `auto:${auto.runId}:${auto.status}`, title: 'Agent berhenti', body: auto.message });
  }
  for (const event of session.events) if (['mission_reset', 'mission_created'].includes(event.kind)) notices.push({ id: event.id, title: event.kind === 'mission_reset' ? 'Misi direset' : 'Misi baharu disahkan', body: event.summary });
  if (session.mission?.status === 'completed') notices.push({ id: `mission:${session.mission.id}:completed`, title: 'Misi selesai', body: session.mission.goal });
  return notices;
}
