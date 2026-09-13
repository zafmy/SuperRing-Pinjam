import { Router } from 'express';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import webpush from 'web-push';
import { bearer } from './evidence';
import { SessionStore, StoreError } from './store';
import { sessionNotices, type SessionNotice } from '../shared/notifications';

export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && (
      url.hostname === 'fcm.googleapis.com' || url.hostname === 'web.push.apple.com' || url.hostname.endsWith('.push.apple.com') ||
      url.hostname === 'updates.push.services.mozilla.com' || url.hostname.endsWith('.push.services.mozilla.com') || url.hostname.endsWith('.notify.windows.com')
    );
  } catch { return false; }
}
const endpoint = z.string().max(4096).refine(allowedPushEndpoint, 'Unsupported browser push endpoint.');
const key = (bytes: number) => z.string().regex(/^[\w-]+={0,2}$/).refine((value) => Buffer.from(value, 'base64url').length === bytes, 'Invalid push key.');
const subscriptionSchema = z.object({ endpoint, keys: z.object({ p256dh: key(65), auth: key(16) }) });
type Subscription = z.infer<typeof subscriptionSchema>;
interface RecordEntry { code: string; actor: string; participantId?: string; subscription: Subscription; seen: string[]; attempts: Record<string, number>; lastError?: string; lastSentAt?: string; lastTestAt?: number }
export type PushSender = (subscription: Subscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

export class PushService {
  private records: Record<string, RecordEntry> = {};
  private file: string;
  private keys: { publicKey: string; privateKey: string };
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private busy = new Set<string>();
  private unsubscribe: () => void;
  private closed = false;
  constructor(private store: SessionStore, directory: string, private subject = 'https://github.com/zafmy/SuperRing-Pinjam', private send: PushSender = webpush.sendNotification) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, 'push-subscriptions.json');
    const keyFile = join(directory, 'push-vapid.json');
    try { this.keys = JSON.parse(readFileSync(keyFile, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.keys = webpush.generateVAPIDKeys();
      writeFileSync(keyFile, JSON.stringify(this.keys), { mode: 0o600, flag: 'wx' });
    }
    try { this.records = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.unsubscribe = store.onChange((code) => this.schedule(code));
    for (const record of Object.values(this.records)) this.schedule(record.code);
  }
  publicKey() { return this.keys.publicKey; }
  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.records), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  private identity(code: string, token: string, endpointValue: string) {
    const principal = this.store.authorize(code, token);
    const actor = principal.role === 'host' ? 'host' : principal.participantId;
    return { id: createHash('sha256').update(`${code.toUpperCase()}:${actor}:${endpointValue}`).digest('hex'), actor, participantId: principal.role === 'participant' ? principal.participantId : undefined };
  }
  subscribe(code: string, token: string, input: unknown) {
    const subscription = subscriptionSchema.parse(input);
    const identity = this.identity(code, token, subscription.endpoint);
    const current = this.records[identity.id];
    if (!current && Object.values(this.records).filter((item) => item.code === code.toUpperCase() && item.actor === identity.actor).length >= 5) throw new StoreError(409, 'PUSH_LIMIT', 'Maksimum lima peranti notifikasi bagi pengguna ini.');
    this.records[identity.id] = { ...current, code: code.toUpperCase(), actor: identity.actor, participantId: identity.participantId, subscription, seen: current?.seen ?? sessionNotices(this.store.read(code, token), identity.participantId).map((notice) => notice.id), attempts: current?.attempts ?? {} };
    try { this.save(); } catch (error) { if (current) this.records[identity.id] = current; else delete this.records[identity.id]; throw error; }
    this.schedule(code.toUpperCase());
    return { subscribed: true };
  }
  remove(code: string, token: string, endpointValue: string) {
    const { id } = this.identity(code, token, endpointValue);
    const current = this.records[id];
    delete this.records[id];
    try { this.save(); } catch (error) { if (current) this.records[id] = current; throw error; }
    return { subscribed: false };
  }
  status(code: string, token: string, endpointValue: string) {
    const record = this.records[this.identity(code, token, endpointValue).id];
    return { subscribed: Boolean(record), lastError: record?.lastError ?? null, lastSentAt: record?.lastSentAt ?? null };
  }
  private async deliver(record: RecordEntry, notice: SessionNotice) {
    if (record.participantId && !this.store.workerState(record.code).participants.some((person) => person.id === record.participantId)) throw new StoreError(401, 'UNAUTHORIZED', 'Participant access revoked.');
    // Lock-screen text stays generic; private mission details are fetched after authentication.
    const url = record.participantId ? `/join/${record.code}` : `/?host=${record.code}`;
    await this.send(record.subscription, JSON.stringify({ title: `PINJAM: ${notice.title}`, body: 'Buka sesi untuk melihat butiran.', tag: `${record.code}:${notice.id}`, url }), {
      vapidDetails: { subject: this.subject, ...this.keys }, TTL: 1200, urgency: 'high', timeout: 10_000,
    });
  }
  async test(code: string, token: string, endpointValue: string) {
    const record = this.records[this.identity(code, token, endpointValue).id];
    if (!record) throw new StoreError(404, 'PUSH_NOT_SUBSCRIBED', 'Aktifkan notifikasi pada peranti ini dahulu.');
    if (record.lastTestAt && Date.now() - record.lastTestAt < 30_000) throw new StoreError(429, 'PUSH_TEST_LIMIT', 'Tunggu 30 saat sebelum ujian seterusnya.');
    record.lastTestAt = Date.now(); this.save();
    try {
      await this.deliver(record, { id: 'test', title: 'Ujian notifikasi', body: '' });
      record.lastSentAt = new Date().toISOString(); delete record.lastError; this.save();
      return { accepted: true };
    } catch {
      record.lastError = 'Perkhidmatan push tidak menerima notifikasi.'; this.save();
      throw new StoreError(502, 'PUSH_FAILED', record.lastError);
    }
  }
  private schedule(code: string, delay = 50) {
    if (this.closed || this.timers.has(code) || this.busy.has(code)) return;
    if (!Object.values(this.records).some((item) => item.code === code)) return;
    const timer = setTimeout(() => {
      this.timers.delete(code);
      void this.flush(code).catch(() => console.error('Push delivery could not persist its status.'));
    }, delay);
    timer.unref(); this.timers.set(code, timer);
  }
  async flush(code: string) {
    if (this.closed || this.busy.has(code)) return;
    this.busy.add(code);
    let retry = false;
    try {
      const session = this.store.workerState(code);
      for (const [id, record] of Object.entries(this.records)) {
        if (record.code !== code) continue;
        if (record.participantId && !session.participants.some((person) => person.id === record.participantId)) { delete this.records[id]; this.save(); continue; }
        const notices = sessionNotices(session, record.participantId).filter((item) => !record.seen.includes(item.id) && (record.attempts[item.id] ?? 0) < 3);
        for (const notice of notices) {
          if (this.closed || this.records[id] !== record) break;
          if (record.participantId && !this.store.workerState(code).participants.some((person) => person.id === record.participantId)) { delete this.records[id]; this.save(); break; }
          if (!sessionNotices(this.store.workerState(code), record.participantId).some((item) => item.id === notice.id)) continue;
          record.attempts[notice.id] = (record.attempts[notice.id] ?? 0) + 1;
          this.save();
          try {
            await this.deliver(record, notice);
            record.seen.push(notice.id); record.lastSentAt = new Date().toISOString(); delete record.lastError;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) { delete this.records[id]; this.save(); break; }
            record.lastError = 'Notifikasi belum diterima perkhidmatan push. Semak sambungan atau aktifkan semula.';
            retry = (record.attempts[notice.id] ?? 0) < 3 || retry;
          }
          this.save();
        }
      }
    } finally {
      this.busy.delete(code);
      if (retry) this.schedule(code, 5000);
      // Process events that arrived while a network delivery was in flight.
      else if (!this.closed) {
        const current = this.store.workerState(code);
        const remaining = Object.values(this.records).some((record) => record.code === code && sessionNotices(current, record.participantId).some((item) => !record.seen.includes(item.id) && (record.attempts[item.id] ?? 0) < 3));
        if (remaining) this.schedule(code);
      }
    }
  }
  close() { this.closed = true; this.unsubscribe(); for (const timer of this.timers.values()) clearTimeout(timer); }
}

export function pushRoutes(store: SessionStore, push?: PushService) {
  const router = Router();
  router.use('/:code/push', (request, _response, next) => { store.authorize(request.params.code, bearer(request)); next(); });
  router.get('/:code/push/config', (_request, response) => response.json({ enabled: Boolean(push), publicKey: push?.publicKey() ?? null }));
  router.post('/:code/push/subscribe', (request, response) => {
    if (!push) throw new StoreError(503, 'PUSH_NOT_CONFIGURED', 'Notifikasi belum dikonfigurasi pada pelayan.');
    response.json(push.subscribe(request.params.code, bearer(request), request.body));
  });
  for (const action of ['unsubscribe', 'status', 'test'] as const) {
    router.post(`/:code/push/${action}`, async (request, response) => {
      if (!push) throw new StoreError(503, 'PUSH_NOT_CONFIGURED', 'Notifikasi belum dikonfigurasi pada pelayan.');
      const input = z.object({ endpoint }).parse(request.body);
      response.json(action === 'unsubscribe' ? push.remove(request.params.code, bearer(request), input.endpoint) : action === 'status' ? push.status(request.params.code, bearer(request), input.endpoint) : await push.test(request.params.code, bearer(request), input.endpoint));
    });
  }
  return router;
}
