import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomationState, AgentStepResult, RespondToTaskInput, CreateMissionInput, CreateRequestInput, Participant, SessionEvent, SessionView, SubmitObservationInput } from '../shared/contracts';

import type { AgentDecision } from './agent-decision';

type Principal = { role: 'host' } | { role: 'participant'; participantId: string };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
interface MediaRecord {
  id: string;
  participantId: string;
  mime: string;
  fileName: string;
  size: number;
  observationId: string | null;
}
interface MutationRecord { fingerprint: string; resourceId: string }

interface StoredSession {
  view: SessionView;
  hostTokenHash: string;
  participantTokenHashes: Record<string, string>;
  media: Record<string, MediaRecord>;
  mutations: Record<string, MutationRecord>;
  automationWaitSignature?: string;
  archives?: SessionView[];
  agentRuns?: Record<string, { action: AgentStepResult['action']; summary: string }>;
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const credential = () => randomBytes(32).toString('hex');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Single-process hackathon storage. Use a transactional DB before multi-instance hosting. */
export class SessionStore {
  private listeners = new Set<(code: string) => void>();
  private sessions: Record<string, StoredSession>;
  private file: string;
  private mediaDirectory: string;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, 'sessions.json');
    this.mediaDirectory = join(directory, 'media');
    mkdirSync(this.mediaDirectory, { recursive: true });
    try {
      this.sessions = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, StoredSession>;
      // Existing starter sessions remain usable after this additive storage upgrade.
      for (const session of Object.values(this.sessions)) {
        session.media ??= {};
        session.mutations ??= {};
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.sessions = {};
    }
  }

  private commit(code: string, record: StoredSession) {
    const next = { ...this.sessions, [code]: record };
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
    // Do not publish in-memory changes if the disk write failed.
    this.sessions = next;
    for (const listener of this.listeners) listener(code);
  }

  authorize(code: string, token: string, role?: Principal['role']): Principal {
    const record = this.lookup(code);
    const tokenHash = hash(token);
    let principal: Principal;
    if (record.hostTokenHash === tokenHash) {
      principal = { role: 'host' };
    } else {
      const participantId = Object.keys(record.participantTokenHashes)
        .find((id) => record.participantTokenHashes[id] === tokenHash);
      if (!participantId) throw new StoreError(401, 'UNAUTHORIZED', 'A valid session token is required.');
      principal = { role: 'participant', participantId };
    }
    if (role && principal.role !== role) throw new StoreError(403, 'FORBIDDEN', `This action requires a ${role} token.`);
    return principal;
  }

  private event(record: StoredSession, kind: SessionEvent['kind'], summary: string) {
    const now = new Date().toISOString();
    record.view.revision += 1;
    record.view.updatedAt = now;
    record.view.events.push({ id: randomUUID(), kind, summary, createdAt: now });
  }

  private mutate(
    code: string, token: string, role: Principal['role'], operation: string, key: string,
    payload: unknown, action: (record: StoredSession, principal: Principal) => string,
  ) {
    const principal = this.authorize(code, token, role);
    const original = this.lookup(code);
    const actor = principal.role === 'host' ? 'host' : principal.participantId;
    const scope = `${actor}:${operation}:${key}`;
    const fingerprint = digest(JSON.stringify(payload));
    const previous = original.mutations[scope];
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new StoreError(409, 'IDEMPOTENCY_CONFLICT', 'This key was already used for different input.');
      }
      return previous.resourceId;
    }
    const draft = structuredClone(original);
    const resourceId = action(draft, principal);
    draft.mutations[scope] = { fingerprint, resourceId };
    this.commit(draft.view.code, draft);
    return resourceId;
  }

  private lookup(code: string) {
    const session = this.sessions[code.toUpperCase()];
    if (!session) throw new StoreError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    return session;
  }

  create(title: string) {
    let code: string;
    do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (this.sessions[code]);
    const now = new Date().toISOString();
    const hostToken = credential();
    const view: SessionView = {
      id: randomUUID(), code, title, revision: 0, createdAt: now, updatedAt: now,
      participants: [], mission: null, requests: [], observations: [], tasks: [], events: [],
    };
    this.commit(code, { view, hostTokenHash: hash(hostToken), participantTokenHashes: {}, media: {}, mutations: {} });
    return { session: structuredClone(view), hostToken };
  }

  join(code: string, name: string, zone: string) {
    const record = structuredClone(this.lookup(code));
    if (record.view.participants.length >= 20) {
      throw new StoreError(409, 'SESSION_FULL', 'This demo session is full.');
    }
    const now = new Date().toISOString();
    const participant: Participant = { id: randomUUID(), name, zone, joinedAt: now };
    const participantToken = credential();
    record.view.participants.push(participant);
    record.participantTokenHashes[participant.id] = hash(participantToken);
    this.event(record, 'participant_joined', `${name} joined at ${zone}.`);
    this.commit(record.view.code, record);
    return { session: structuredClone(record.view), participantId: participant.id, participantToken };
  }

  read(code: string, token: string) {
    this.authorize(code, token);
    return structuredClone(this.lookup(code).view);
  }

  createMission(code: string, token: string, key: string, input: CreateMissionInput) {
    this.mutate(code, token, 'host', 'mission', key, input, (record) => {
      if (record.view.mission) throw new StoreError(409, 'MISSION_EXISTS', 'Reset the current mission before confirming another one.');
      const id = randomUUID();
      record.view.mission = { id, ...input, status: 'active' };
      this.event(record, 'mission_created', 'The host confirmed the mission requirements.');
      return id;
    });
    return { session: this.read(code, token) };
  }

  createRequest(code: string, token: string, key: string, input: CreateRequestInput) {
    this.mutate(code, token, 'host', 'request', key, input, (record) => {
      const participant = record.view.participants.find((entry) => entry.id === input.participantId);
      if (!participant) throw new StoreError(404, 'PARTICIPANT_NOT_FOUND', 'Participant is not in this session.');
      const id = randomUUID();
      record.view.requests.push({ id, ...input, status: 'pending', createdAt: new Date().toISOString() });
      this.event(record, 'request_created', `Requested a ${input.kind} from ${participant.name} at ${participant.zone}.`);
      return id;
    });
    return { session: this.read(code, token) };
  }

  uploadMedia(code: string, token: string, key: string, buffer: Buffer, mime: string) {
    if (buffer.length === 0) throw new StoreError(400, 'IMAGE_REQUIRED', 'Upload a non-empty image.');
    if (buffer.length > MAX_IMAGE_BYTES) throw new StoreError(413, 'PAYLOAD_TOO_LARGE', 'Image must be no larger than 5 MiB.');
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = extensions[mime];
    if (!extension) throw new StoreError(415, 'UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP image.');
    let createdPath: string | undefined;
    try {
      const mediaId = this.mutate(code, token, 'participant', 'media', key,
        { content: digest(buffer), mime }, (record, principal) => {
          if (principal.role !== 'participant') throw new StoreError(403, 'FORBIDDEN', 'Participant required.');
          const used = Object.values(record.media).reduce((sum, media) => sum + media.size, 0);
          if (used + buffer.length > 50 * 1024 * 1024) {
            throw new StoreError(413, 'MEDIA_QUOTA_EXCEEDED', 'This demo session has reached its 50 MiB image limit.');
          }
          const id = randomUUID();
          const fileName = `${id}.${extension}`;
          createdPath = join(this.mediaDirectory, fileName);
          writeFileSync(createdPath, buffer, { mode: 0o600, flag: 'wx' });
          record.media[id] = { id, fileName, mime, size: buffer.length, participantId: principal.participantId, observationId: null };
          return id;
        });
      return { mediaId };
    } catch (error) {
      if (createdPath) rmSync(createdPath, { force: true });
      throw error;
    }
  }

  readMedia(code: string, token: string, mediaId: string) {
    this.authorize(code, token);
    return this.mediaBytes(code, mediaId);
  }

  private mediaBytes(code: string, mediaId: string) {
    const media = this.lookup(code).media[mediaId];
    if (!media) throw new StoreError(404, 'MEDIA_NOT_FOUND', 'Image is not in this session.');
    try {
      return { buffer: readFileSync(join(this.mediaDirectory, media.fileName)), mime: media.mime };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StoreError(404, 'MEDIA_NOT_FOUND', 'The stored image is unavailable.');
      }
      throw error;
    }
  }

  submitObservation(code: string, token: string, key: string, input: SubmitObservationInput) {
    this.mutate(code, token, 'participant', 'observation', key, input, (record, principal) => {
      if (principal.role !== 'participant') throw new StoreError(403, 'FORBIDDEN', 'Participant required.');
      const request = record.view.requests.find((entry) => entry.id === input.requestId);
      if (!request) throw new StoreError(404, 'REQUEST_NOT_FOUND', 'Request is not in this session.');
      if (request.participantId !== principal.participantId) {
        throw new StoreError(403, 'FORBIDDEN', 'Only the requested participant can answer.');
      }
      if (request.status !== 'pending') throw new StoreError(409, 'REQUEST_CLOSED', 'This request is already answered or cancelled.');
      if (request.kind === 'photo' && !input.mediaId) throw new StoreError(400, 'IMAGE_REQUIRED', 'This request needs an image.');
      if (!input.mediaId && !input.text.trim()) throw new StoreError(400, 'EMPTY_OBSERVATION', 'Provide a response.');
      const media = input.mediaId ? record.media[input.mediaId] : undefined;
      if (input.mediaId && !media) throw new StoreError(404, 'MEDIA_NOT_FOUND', 'Image is not in this session.');
      if (media && media.participantId !== principal.participantId) {
        throw new StoreError(403, 'FORBIDDEN', 'Use an image uploaded by this participant.');
      }
      if (media?.observationId) throw new StoreError(409, 'MEDIA_ALREADY_USED', 'Capture a new image for this request.');
      const participant = record.view.participants.find((entry) => entry.id === principal.participantId)!;
      const id = randomUUID();
      record.view.observations.push({ id, ...input, participantId: participant.id, zone: participant.zone, receivedAt: new Date().toISOString() });
      request.status = 'answered';
      if (media) media.observationId = id;
      this.event(record, 'observation_added', `${participant.name} responded from ${participant.zone}.`);
      return id;
    });
    return { session: this.read(code, token) };
  }

  agentResult(code: string, token: string, key: string): AgentStepResult | undefined {
    this.authorize(code, token, 'host');
    const run = this.lookup(code).agentRuns?.[key];
    return run ? { session: this.read(code, token), ...run } : undefined;
  }

  applyAgentDecision(code: string, token: string, key: string, revision: number, decision: AgentDecision, visibleImageIds: string[]): AgentStepResult {
    this.authorize(code, token, 'host');
    const previous = this.agentResult(code, token, key);
    if (previous) return previous;
    return this.applyDecision(code, key, revision, decision, visibleImageIds);
  }

  private applyDecision(code: string, key: string, revision: number, decision: AgentDecision, visibleImageIds: string[], afterApply?: (record: StoredSession) => void): AgentStepResult {
    const record = structuredClone(this.lookup(code));
    const view = record.view;
    if (view.revision !== revision) throw new StoreError(409, 'AGENT_STALE', 'Sesi berubah semasa agent berfikir. Cuba langkah baharu.');
    if (!view.mission || view.mission.status === 'completed') throw new StoreError(409, 'MISSION_REQUIRED', 'An unfinished mission is required.');
    const invalid = (message: string): never => { throw new StoreError(422, 'AGENT_ACTION_REJECTED', message); };
    const sources = 'sourceObservationIds' in decision ? decision.sourceObservationIds.map((id) => {
      const source = view.observations.find((item) => item.id === id);
      if (!source) return invalid('Agent referenced unknown evidence.');
      return source;
    }) : [];
    const freshPhoto = (after: string) => sources.some((item) => item.mediaId && visibleImageIds.includes(item.id) && item.receivedAt > after);
    const now = new Date().toISOString();
    if (decision.action === 'request' || decision.action === 'offer_task') {
      if (!view.participants.some((person) => person.id === decision.participantId)) invalid('Agent selected an unknown participant.');
    }
    switch (decision.action) {
      case 'request':
        if (view.requests.some((item) => item.participantId === decision.participantId && item.status === 'pending')) invalid('This participant already has a pending request.');
        view.requests.push({ id: randomUUID(), participantId: decision.participantId, kind: decision.kind, prompt: decision.prompt, status: 'pending', createdAt: now });
        this.event(record, 'request_created', decision.summary);
        break;
      case 'offer_task':
        if (view.tasks.some((item) => item.participantId === decision.participantId && !['completed', 'declined', 'cancelled'].includes(item.status))) invalid('This participant already has an unfinished task.');
        view.tasks.push({ id: randomUUID(), participantId: decision.participantId, title: decision.title, status: 'offered', sourceObservationIds: decision.sourceObservationIds, note: '', createdAt: now, updatedAt: now });
        this.event(record, 'task_updated', decision.summary);
        break;
      case 'verify_task': {
        const task = view.tasks.find((item) => item.id === decision.taskId);
        if (!task || task.status !== 'needs_verification') invalid('Only reported tasks can be verified.');
        if (!freshPhoto(task!.updatedAt)) invalid('Task verification needs a newer photo that was provided to the model.');
        task!.status = 'completed';
        task!.sourceObservationIds = [...new Set([...task!.sourceObservationIds, ...decision.sourceObservationIds])];
        task!.updatedAt = now;
        this.event(record, 'task_updated', decision.summary);
        break;
      }
      case 'complete_mission': {
        if (view.tasks.some((item) => !['completed', 'declined', 'cancelled'].includes(item.status))) invalid('Unfinished tasks must be resolved first.');
        const requirements = new Set(decision.requirementIds);
        if (requirements.size !== view.mission.requirements.length || !view.mission.requirements.every((item) => requirements.has(item.id))) invalid('Every mission requirement must be covered.');
        // Completion needs a final photo after all task state changes, not an initial inventory photo.
        const cutoff = view.tasks.reduce((latest, task) => task.updatedAt > latest ? task.updatedAt : latest, view.events.find((event) => event.kind === 'mission_created')?.createdAt ?? view.createdAt);
        if (!freshPhoto(cutoff)) invalid('Mission completion needs fresh final photo evidence.');
        if (view.requests.some((item) => item.status === 'pending')) invalid('Resolve pending evidence requests before completing the mission.');
        view.mission.status = 'completed';
        break;
      }
      case 'wait': break;
    }
    this.event(record, 'agent_step', decision.summary);
    record.agentRuns ??= {};
    record.agentRuns[key] = { action: decision.action, summary: decision.summary };
    afterApply?.(record);
    this.commit(view.code, record);
    return { session: structuredClone(record.view), action: decision.action, summary: decision.summary };
  }

  respondToTask(code: string, token: string, key: string, taskId: string, input: RespondToTaskInput) {
    this.mutate(code, token, 'participant', 'task-response', key, { taskId, ...input }, (record, principal) => {
      const task = record.view.tasks.find((item) => item.id === taskId);
      if (!task) throw new StoreError(404, 'TASK_NOT_FOUND', 'Task not found.');
      if (principal.role !== 'participant' || task.participantId !== principal.participantId) throw new StoreError(403, 'FORBIDDEN', 'Only the assigned participant can respond.');
      const allowed = input.action === 'accept' ? ['offered'] : input.action === 'decline' ? ['offered', 'accepted', 'in_progress'] : input.action === 'start' ? ['accepted'] : ['accepted', 'in_progress'];
      if (!allowed.includes(task.status)) throw new StoreError(409, 'INVALID_TASK_TRANSITION', 'This action is not available for this task state.');
      task.status = input.action === 'accept' ? 'accepted' : input.action === 'decline' ? 'declined' : input.action === 'start' ? 'in_progress' : 'needs_verification';
      task.note = input.note ?? '';
      task.updatedAt = new Date().toISOString();
      this.event(record, 'task_updated', `Participant response: ${task.status}. ${task.note}`);
      return task.id;
    });
    return { session: this.read(code, token) };
  }


  onChange(listener: (code: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resetMission(code: string, token: string, key: string, missionId: string) {
    this.mutate(code, token, 'host', 'mission-reset', key, { missionId }, (record) => {
      if (record.view.mission?.id !== missionId) throw new StoreError(409, 'MISSION_CHANGED', 'Misi telah berubah. Muat semula paparan.');
      record.archives ??= [];
      record.archives.push(structuredClone(record.view));
      // Archive, rather than delete, old evidence and history. Tokens and invite stay valid.
      record.view.mission = null;
      record.view.requests = [];
      record.view.tasks = [];
      record.view.observations = [];
      record.view.events = [];
      if (record.view.automation) {
        record.view.automation.enabled = false;
        record.view.automation.status = 'stopped';
        record.view.automation.message = 'Misi direset oleh penyelaras.';
        record.view.automation.updatedAt = new Date().toISOString();
      }
      delete record.automationWaitSignature;
      this.event(record, 'mission_reset', 'Penyelaras mereset misi. Tunggu misi baharu; tugasan lama tidak lagi aktif.');
      return missionId;
    });
    return { session: this.read(code, token) };
  }

  startAutomation(code: string, token: string, key: string, missionId: string, maxSteps: number) {
    this.mutate(code, token, 'host', 'auto-start', key, { missionId, maxSteps }, (record) => {
      const view = record.view;
      if (view.mission?.id !== missionId) throw new StoreError(409, 'MISSION_CHANGED', 'Sahkan misi semasa dahulu.');
      if (view.mission.status === 'completed') throw new StoreError(409, 'MISSION_COMPLETED', 'Misi sudah selesai.');
      if (!view.participants.length) throw new StoreError(409, 'PARTICIPANTS_REQUIRED', 'Jemput peserta dahulu.');
      if (view.automation?.enabled) return view.automation.runId;
      const now = new Date();
      view.automation = { runId: randomUUID(), missionId, enabled: true, status: 'running', steps: 0, maxSteps,
        startedAt: now.toISOString(), updatedAt: now.toISOString(), deadlineAt: new Date(now.getTime() + 20 * 60_000).toISOString(), message: 'Mod automatik dimulakan.' };
      delete record.automationWaitSignature;
      this.event(record, 'automation_changed', 'Penyelaras memulakan agent automatik.');
      return view.automation.runId;
    });
    return { session: this.read(code, token) };
  }

  stopAgent(code: string, token: string, key: string, missionId: string) {
    this.mutate(code, token, 'host', 'agent-stop', key, { missionId }, (record) => {
      if (record.view.mission?.id !== missionId) throw new StoreError(409, 'MISSION_CHANGED', 'Misi telah berubah.');
      const now = new Date().toISOString();
      record.view.automation ??= { runId: randomUUID(), missionId, enabled: false, status: 'stopped', steps: 0, maxSteps: 30, startedAt: now, updatedAt: now, deadlineAt: now, message: '' };
      record.view.automation.enabled = false;
      record.view.automation.status = 'stopped';
      record.view.automation.updatedAt = now;
      record.view.automation.message = 'Dihentikan oleh penyelaras. Tiada keputusan baharu akan digunakan.';
      this.event(record, 'automation_changed', record.view.automation.message);
      return record.view.automation.runId;
    });
    return { session: this.read(code, token) };
  }

  /** Worker-only access: public routes must authorize before obtaining any snapshot. */
  workerState(code: string) { return structuredClone(this.lookup(code).view); }

  private requireRun(code: string, runId: string) {
    const record = this.lookup(code);
    if (!record.view.automation?.enabled || record.view.automation.runId !== runId || record.view.automation.missionId !== record.view.mission?.id) {
      throw new StoreError(409, 'AGENT_STOPPED', 'Agent sudah dihentikan atau misi berubah.');
    }
    return record;
  }

  workerShouldWait(code: string, runId: string) {
    const record = this.requireRun(code, runId);
    return record.automationWaitSignature === agentInputSignature(record.view);
  }

  beginAutomaticStep(code: string, runId: string) {
    const record = structuredClone(this.requireRun(code, runId));
    const state = record.view.automation!;
    if (state.steps >= state.maxSteps || Date.now() >= Date.parse(state.deadlineAt)) throw new StoreError(409, 'AGENT_LIMIT', 'Had langkah atau masa dicapai.');
    state.steps++;
    state.status = 'running';
    state.message = 'Agent sedang menilai bukti…';
    state.updatedAt = new Date().toISOString();
    record.view.revision++;
    record.view.updatedAt = state.updatedAt;
    this.commit(record.view.code, record);
    return structuredClone(record.view);
  }

  workerImages(code: string, runId: string) {
    const record = this.requireRun(code, runId);
    return record.view.observations.filter((item) => item.mediaId).slice(-6).map((item) => {
      const media = this.mediaBytes(code, item.mediaId!);
      return { observationId: item.id, dataUrl: `data:${media.mime};base64,${media.buffer.toString('base64')}` };
    });
  }

  applyAutomaticDecision(code: string, runId: string, revision: number, decision: AgentDecision, imageIds: string[]) {
    const state = this.requireRun(code, runId).view.automation!;
    return this.applyDecision(code, `auto:${runId}:${state.steps}`, revision, decision, imageIds, (record) => {
      const auto = record.view.automation!;
      const waiting = ['request', 'offer_task', 'wait'].includes(decision.action);
      auto.status = decision.action === 'complete_mission' ? 'completed' : waiting ? 'waiting' : 'running';
      auto.enabled = auto.status !== 'completed';
      auto.message = decision.summary;
      auto.updatedAt = new Date().toISOString();
      if (waiting) record.automationWaitSignature = agentInputSignature(record.view);
      else delete record.automationWaitSignature;
    });
  }

  haltAutomation(code: string, runId: string, status: 'error' | 'limit_reached' | 'stopped', message: string) {
    const original = this.lookup(code);
    if (!original.view.automation?.enabled || original.view.automation.runId !== runId) return;
    const record = structuredClone(original);
    Object.assign(record.view.automation!, { enabled: false, status, message, updatedAt: new Date().toISOString() });
    this.event(record, status === 'error' ? 'agent_error' : 'automation_changed', message);
    this.commit(record.view.code, record);
  }

  recoverAutomations() {
    for (const record of Object.values(this.sessions)) {
      if (record.view.automation?.enabled) this.haltAutomation(record.view.code, record.view.automation.runId, 'stopped', 'Pelayan dimulakan semula. Tekan Mulakan automatik untuk menyambung.');
    }
  }

}

/** Ignore monitor/event changes so polling and waiting never spend model credits. */
export function agentInputSignature(view: SessionView) {
  return digest(JSON.stringify({ mission: view.mission, participants: view.participants, requests: view.requests, observations: view.observations, tasks: view.tasks }));
}
