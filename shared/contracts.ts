/** Shared contract: coordinate changes with both owners before editing. */
export type MissionStatus = 'draft' | 'active' | 'waiting' | 'verifying' | 'completed' | 'blocked';
export type TaskStatus = 'offered' | 'accepted' | 'declined' | 'in_progress' | 'needs_verification' | 'completed' | 'cancelled';

export interface Participant {
  id: string;
  name: string;
  zone: string;
  joinedAt: string;
}

export interface Requirement {
  id: string;
  label: string;
  quantity: number;
}

export interface Mission {
  id: string;
  goal: string;
  requirements: Requirement[];
  status: MissionStatus;
}

export interface ObservationRequest {
  id: string;
  participantId: string;
  kind: 'photo' | 'question';
  prompt: string;
  status: 'pending' | 'answered' | 'cancelled';
  createdAt: string;
}

export interface Observation {
  id: string;
  requestId: string;
  participantId: string;
  zone: string;
  text: string;
  mediaId: string | null;
  receivedAt: string;
}

export interface Task {
  id: string;
  participantId: string;
  title: string;
  status: TaskStatus;
  sourceObservationIds: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionEvent {
  id: string;
  kind: 'participant_joined' | 'mission_created' | 'request_created' | 'observation_added' | 'task_updated' | 'agent_error';
  summary: string;
  createdAt: string;
}

export interface SessionView {
  id: string;
  code: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  mission: Mission | null;
  requests: ObservationRequest[];
  observations: Observation[];
  tasks: Task[];
  events: SessionEvent[];
}

export interface ApiErrorBody { error: { code: string; message: string } }
export interface HealthResponse { ok: true; service: 'pinjam'; agent: 'not_configured' }
export interface CreateSessionInput { title?: string }
export interface CreateSessionResponse { session: SessionView; hostToken: string }
export interface JoinSessionInput { name: string; zone: string }
export interface JoinSessionResponse { session: SessionView; participantId: string; participantToken: string }
export interface GetSessionResponse { session: SessionView }

/** Planned mutations: see docs/API_CONTRACT.md for implementation status. */
export interface CreateMissionInput { goal: string; requirements: Requirement[] }
export interface CreateRequestInput { participantId: string; kind: 'photo' | 'question'; prompt: string }
export interface SubmitObservationInput { requestId: string; text: string; mediaId: string | null }
export interface RespondToTaskInput {
  action: 'accept' | 'decline' | 'start' | 'report_done';
  note?: string;
}
