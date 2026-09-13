import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PushService, allowedPushEndpoint, type PushSender } from './push';
import { SessionStore } from './store';
import { sessionNotices } from '../shared/notifications';
import { createApp } from './app';
import webpush from 'web-push';
import type { AddressInfo } from 'node:net';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'pinjam-push-'));
  const store = new SessionStore(directory);
  const { session, hostToken } = store.create('Workshop');
  const ali = store.join(session.code, 'Ali', 'Meja');
  const mira = store.join(session.code, 'Mira', 'Bekalan');
  const pair = createECDH('prime256v1'); pair.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: pair.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  return { directory, store, code: session.code, hostToken, ali, mira, subscription, clean: () => rmSync(directory, { recursive: true, force: true }) };
}

test('push delivers only assigned-user work, deduplicates changes, survives restart and supports unsubscribe', async () => {
  const x = setup(); const payloads: string[] = [];
  const sender: PushSender = async (subscription, payload, options) => {
    const details = webpush.generateRequestDetails(subscription, payload, options);
    assert.ok(details.headers.Authorization);
    assert.ok(Buffer.isBuffer(details.body));
    assert.ok(!details.body!.includes(Buffer.from('Buka sesi')));
    payloads.push(payload);
  };
  const push = new PushService(x.store, x.directory, undefined, sender);
  let restored: PushService | undefined;
  try {
    const publicKey = push.publicKey();
    push.subscribe(x.code, x.ali.participantToken, x.subscription);
    x.store.createRequest(x.code, x.hostToken, 'mira-request', { participantId: x.mira.participantId, kind: 'photo', prompt: 'Mira private prompt' });
    await push.flush(x.code); assert.equal(payloads.length, 0);
    x.store.createRequest(x.code, x.hostToken, 'ali-request', { participantId: x.ali.participantId, kind: 'photo', prompt: 'Ali private prompt' });
    await push.flush(x.code); assert.equal(payloads.length, 1);
    const payload = JSON.parse(payloads[0]);
    assert.equal(payload.url, `/join/${x.code}`); assert.match(payload.title, /Gambar/);
    assert.ok(!payloads[0].includes('private prompt')); assert.ok(!payloads[0].includes(x.ali.participantToken));
    await push.flush(x.code); assert.equal(payloads.length, 1);
    assert.ok(!JSON.stringify(x.store.read(x.code, x.hostToken)).includes('test-device'));
    assert.equal(push.status(x.code, x.mira.participantToken, x.subscription.endpoint).subscribed, false);
    push.remove(x.code, x.mira.participantToken, x.subscription.endpoint);
    assert.equal(push.status(x.code, x.ali.participantToken, x.subscription.endpoint).subscribed, true);
    push.close(); restored = new PushService(x.store, x.directory, undefined, sender);
    assert.equal(restored.publicKey(), publicKey); await restored.flush(x.code); assert.equal(payloads.length, 1);
    restored.remove(x.code, x.ali.participantToken, x.subscription.endpoint);
    assert.equal(restored.status(x.code, x.ali.participantToken, x.subscription.endpoint).subscribed, false);
    const persisted = readFileSync(join(x.directory, 'push-subscriptions.json'), 'utf8');
    assert.ok(!persisted.includes(x.ali.participantToken));
  } finally { push.close(); restored?.close(); x.clean(); }
});

test('push removes expired endpoints, caps transient retries and rejects arbitrary/internal URLs', async () => {
  const x = setup(); let sends = 0;
  const failing = new PushService(x.store, x.directory, undefined, async () => { sends++; throw { statusCode: 503 }; });
  try {
    assert.equal(allowedPushEndpoint('https://127.0.0.1:3001/'), false);
    assert.equal(allowedPushEndpoint('https://fcm.googleapis.com.evil.example/'), false);
    assert.equal(allowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x'), false);
    assert.equal(allowedPushEndpoint('https://user@web.push.apple.com/x'), false);
    assert.equal(allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
    assert.throws(() => failing.subscribe(x.code, x.ali.participantToken, { ...x.subscription, endpoint: 'https://localhost/' }));
    failing.subscribe(x.code, x.ali.participantToken, x.subscription);
    x.store.createRequest(x.code, x.hostToken, 'request-photo', { participantId: x.ali.participantId, kind: 'photo', prompt: 'Photo' });
    for (let index = 0; index < 5; index++) await failing.flush(x.code);
    assert.equal(sends, 3); assert.ok(failing.status(x.code, x.ali.participantToken, x.subscription.endpoint).lastError);
  } finally { failing.close(); }
  const expired = new PushService(x.store, x.directory, undefined, async () => { throw { statusCode: 410 }; });
  try {
    x.store.createRequest(x.code, x.hostToken, 'request-again', { participantId: x.ali.participantId, kind: 'question', prompt: 'Ready?' });
    await expired.flush(x.code);
    assert.equal(expired.status(x.code, x.ali.participantToken, x.subscription.endpoint).subscribed, false);
  } finally { expired.close(); x.clean(); }
});

test('push API scopes config, status and test sends to authenticated subscriber', async () => {
  const x = setup(); let sends = 0;
  const push = new PushService(x.store, x.directory, undefined, async () => { sends++; });
  const app = createApp(x.store, undefined, push);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sessions/${x.code}/push`;
  const post = (action: string, token: string, body: unknown) => fetch(`${base}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/config`)).status, 401);
    assert.equal((await post('subscribe', x.ali.participantToken, x.subscription)).status, 200);
    assert.equal((await post('test', x.mira.participantToken, { endpoint: x.subscription.endpoint })).status, 404);
    assert.equal((await post('test', x.ali.participantToken, { endpoint: x.subscription.endpoint })).status, 200);
    assert.equal(sends, 1);
    assert.equal((await post('test', x.ali.participantToken, { endpoint: x.subscription.endpoint })).status, 429);
    const notices = sessionNotices(x.store.read(x.code, x.hostToken), x.ali.participantId);
    assert.equal(notices.length, 0);
  } finally { app.locals.agentRunner.close(); push.close(); await new Promise<void>((resolve) => server.close(() => resolve())); x.clean(); }
});


test('kicking a participant purges subscriptions and suppresses queued notifications', async () => {
  const x = setup(); let sends = 0;
  const push = new PushService(x.store, x.directory, undefined, async () => { sends++; });
  try {
    push.subscribe(x.code, x.ali.participantToken, x.subscription);
    x.store.createRequest(x.code, x.hostToken, 'queued-before-kick', { participantId: x.ali.participantId, kind: 'photo', prompt: 'Photo' });
    x.store.removeParticipant(x.code, x.hostToken, 'kick-subscriber', x.ali.participantId);
    await push.flush(x.code);
    assert.equal(sends, 0);
    assert.ok(!readFileSync(join(x.directory, 'push-subscriptions.json'), 'utf8').includes(x.subscription.endpoint));
    assert.throws(() => push.subscribe(x.code, x.ali.participantToken, x.subscription), { code: 'UNAUTHORIZED' });
  } finally { push.close(); x.clean(); }
});
