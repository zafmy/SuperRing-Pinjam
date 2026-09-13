import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CreateMissionInput, CreateRequestInput, Participant, SessionEvent, SessionView, SubmitObservationInput } from '../shared/contracts';

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
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const credential = () => randomBytes(32).toString('hex');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Single-process hackathon storage. Use a transactional DB before multi-instance hosting. */
export class SessionStore {
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
      if (record.view.mission) throw new StoreError(409, 'MISSION_EXISTS', 'Use a new session for another mission.');
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
}
