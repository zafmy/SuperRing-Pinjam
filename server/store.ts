import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Participant, SessionView } from '../shared/contracts';

interface StoredSession {
  view: SessionView;
  hostTokenHash: string;
  participantTokenHashes: Record<string, string>;
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const credential = () => randomBytes(32).toString('hex');

/** Single-process hackathon storage. Use a transactional DB before multi-instance hosting. */
export class SessionStore {
  private sessions: Record<string, StoredSession>;
  private file: string;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, 'sessions.json');
    try {
      this.sessions = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, StoredSession>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.sessions = {};
    }
  }

  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.sessions), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
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
    this.sessions[code] = { view, hostTokenHash: hash(hostToken), participantTokenHashes: {} };
    this.save();
    return { session: structuredClone(view), hostToken };
  }

  join(code: string, name: string, zone: string) {
    const record = this.lookup(code);
    if (record.view.participants.length >= 20) {
      throw new StoreError(409, 'SESSION_FULL', 'This demo session is full.');
    }
    const now = new Date().toISOString();
    const participant: Participant = { id: randomUUID(), name, zone, joinedAt: now };
    const participantToken = credential();
    record.view.participants.push(participant);
    record.participantTokenHashes[participant.id] = hash(participantToken);
    record.view.revision += 1;
    record.view.updatedAt = now;
    record.view.events.push({ id: randomUUID(), kind: 'participant_joined',
      summary: `${name} joined at ${zone}.`, createdAt: now });
    this.save();
    return { session: structuredClone(record.view), participantId: participant.id, participantToken };
  }

  read(code: string, token: string) {
    const record = this.lookup(code);
    const tokenHash = hash(token);
    if (record.hostTokenHash !== tokenHash && !Object.values(record.participantTokenHashes).includes(tokenHash)) {
      throw new StoreError(401, 'UNAUTHORIZED', 'A valid session token is required.');
    }
    return structuredClone(record.view);
  }
}
