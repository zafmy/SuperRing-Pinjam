import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from './app';
import { SessionStore } from './store';
import type { CreateSessionResponse, JoinSessionResponse, GetSessionResponse } from '../shared/contracts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const mission = { goal: 'Prepare the workshop table.', requirements: [{ id: 'pen', label: 'Pen', quantity: 3 }] };

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'pinjam-evidence-'));
  const store = new SessionStore(directory);
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const post = (path: string, body: unknown, token?: string, key = randomUUID()) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const created: CreateSessionResponse = await (await post('/sessions', {})).json();
  const prefix = `/sessions/${created.session.code}`;
  const ali: JoinSessionResponse = await (await post(`${prefix}/join`, { name: 'Ali', zone: 'Bekalan' })).json();
  const mira: JoinSessionResponse = await (await post(`${prefix}/join`, { name: 'Mira', zone: 'Pendaftaran' })).json();
  const image = (token = ali.participantToken, bytes: Uint8Array = png, key = randomUUID(), field = 'image', claimedType = 'image/png') => {
    const form = new FormData();
    form.append(field, new Blob([Uint8Array.from(bytes)], { type: claimedType }), 'photo.png');
    return fetch(`${base}${prefix}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body: form });
  };
  const request = async (participantId = ali.participantId, kind: 'photo' | 'question' = 'photo') => {
    const response = await post(`${prefix}/requests`, { participantId, kind, prompt: 'Show the table.' }, created.hostToken);
    assert.equal(response.status, 201);
    const snapshot: GetSessionResponse = await response.json();
    return snapshot.session.requests.at(-1)!;
  };
  return { base, prefix, post, created, ali, mira, image, request, directory, store };
}

test('mission → photo request → participant upload → shared observation persists after reload', async (t) => {
  const s = await setup(t);
  const missionResponse = await s.post(`${s.prefix}/missions`, mission, s.created.hostToken);
  assert.equal(missionResponse.status, 201);
  const request = await s.request();
  const upload = await s.image();
  assert.equal(upload.status, 201, await upload.clone().text());
  const { mediaId } = await upload.json();
  const response = await s.post(`${s.prefix}/observations`, {
    requestId: request.id, text: 'Three pens here.', mediaId,
    participantId: s.mira.participantId, zone: 'Spoofed location',
  }, s.ali.participantToken);
  assert.equal(response.status, 201);
  const { session }: GetSessionResponse = await response.json();
  assert.equal(session.requests[0].status, 'answered');
  assert.equal(session.observations[0].participantId, s.ali.participantId);
  assert.equal(session.observations[0].zone, 'Bekalan');
  assert.equal(session.mission?.status, 'active');
  assert.ok(session.observations[0].receivedAt);
  const image = await fetch(`${s.base}${s.prefix}/media/${mediaId}`, { headers: { Authorization: `Bearer ${s.mira.participantToken}` } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(image.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const reloaded = new SessionStore(s.directory);
  assert.equal(reloaded.read(s.created.session.code, s.created.hostToken).observations.length, 1);
  assert.deepEqual(reloaded.readMedia(s.created.session.code, s.created.hostToken, mediaId).buffer, png);
});

test('host-only requests and participant/image ownership hold across participants and sessions', async (t) => {
  const s = await setup(t);
  assert.equal((await s.post(`${s.prefix}/missions`, mission, s.ali.participantToken)).status, 403);
  assert.equal((await s.post(`${s.prefix}/requests`, { participantId: s.ali.participantId, kind: 'photo', prompt: 'Show it.' }, s.ali.participantToken)).status, 403);
  assert.equal((await s.image(s.created.hostToken)).status, 403);
  const requested = await s.request();
  const { mediaId } = await (await s.image()).json();
  const body = { requestId: requested.id, text: '', mediaId };
  assert.equal((await s.post(`${s.prefix}/observations`, body, s.mira.participantToken)).status, 403);
  assert.equal((await s.post(`${s.prefix}/observations`, body, s.created.hostToken)).status, 403);
  const miraRequest = await s.request(s.mira.participantId);
  assert.equal((await s.post(`${s.prefix}/observations`, { ...body, requestId: miraRequest.id }, s.mira.participantToken)).status, 403);
  const other: CreateSessionResponse = await (await s.post('/sessions', {})).json();
  assert.equal((await fetch(`${s.base}${s.prefix}/media/${mediaId}`, { headers: { Authorization: `Bearer ${other.hostToken}` } })).status, 401);
  assert.equal((await fetch(`${s.base}/sessions/${other.session.code}/media/${mediaId}`, { headers: { Authorization: `Bearer ${other.hostToken}` } })).status, 404);
  assert.equal((await fetch(`${s.base}${s.prefix}/media/${mediaId}`)).status, 401);
});

test('concurrent retries produce one upload and one observation; changed payloads conflict', async (t) => {
  const s = await setup(t);
  const requestKey = randomUUID();
  const input = { participantId: s.ali.participantId, kind: 'photo', prompt: 'Show the table.' };
  const first: GetSessionResponse = await (await s.post(`${s.prefix}/requests`, input, s.created.hostToken, requestKey)).json();
  const retry: GetSessionResponse = await (await s.post(`${s.prefix}/requests`, input, s.created.hostToken, requestKey)).json();
  assert.equal(retry.session.requests.length, 1);
  assert.equal(retry.session.revision, first.session.revision);
  assert.equal((await s.post(`${s.prefix}/requests`, { ...input, prompt: 'Different prompt.' }, s.created.hostToken, requestKey)).status, 409);
  const mediaKey = randomUUID();
  const uploaded = await Promise.all([s.image(s.ali.participantToken, png, mediaKey), s.image(s.ali.participantToken, png, mediaKey)]);
  for (const result of uploaded) assert.equal(result.status, 201, await result.clone().text());
  const [a, b] = await Promise.all(uploaded.map((result) => result.json()));
  assert.equal(a.mediaId, b.mediaId);
  assert.equal((await readdir(join(s.directory, 'media'))).length, 1);
  const observationKey = randomUUID();
  const body = { requestId: first.session.requests[0].id, text: 'Pens.', mediaId: a.mediaId };
  const replies = await Promise.all([s.post(`${s.prefix}/observations`, body, s.ali.participantToken, observationKey), s.post(`${s.prefix}/observations`, body, s.ali.participantToken, observationKey)]);
  for (const result of replies) assert.equal(result.status, 201);
  const snapshot = s.store.read(s.created.session.code, s.created.hostToken);
  assert.equal(snapshot.observations.length, 1);
  assert.equal(snapshot.events.filter((event) => event.kind === 'observation_added').length, 1);
  assert.equal((await s.post(`${s.prefix}/observations`, { ...body, text: 'Changed.' }, s.ali.participantToken, observationKey)).status, 409);
  assert.equal((await s.post(`${s.prefix}/observations`, body, s.ali.participantToken)).status, 409);
  const reloaded = new SessionStore(s.directory);
  assert.equal(reloaded.submitObservation(s.created.session.code, s.ali.participantToken, observationKey, body).session.observations.length, 1);
  const nextRequest = await s.request();
  const reused = await s.post(`${s.prefix}/observations`, { ...body, requestId: nextRequest.id }, s.ali.participantToken);
  assert.equal(reused.status, 409);
  assert.equal((await reused.json()).error.code, 'MEDIA_ALREADY_USED');
});

test('bad uploads, oversized images and missing idempotency keys fail before becoming evidence', async (t) => {
  const s = await setup(t);
  assert.equal((await s.image(s.ali.participantToken, Buffer.from('<svg><script>alert(1)</script></svg>'), randomUUID(), 'image', 'image/jpeg')).status, 415);
  assert.equal((await s.image(s.ali.participantToken, new Uint8Array())).status, 400);
  assert.equal((await s.image(s.ali.participantToken, new Uint8Array(5 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await s.image(s.ali.participantToken, png, randomUUID(), 'wrong-field')).status, 400);
  const malformed = await fetch(`${s.base}${s.prefix}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${s.ali.participantToken}`, 'Idempotency-Key': randomUUID(), 'Content-Type': 'multipart/form-data; boundary=broken' }, body: 'invalid multipart',
  });
  assert.equal(malformed.status, 400);
  const missingKey = await fetch(`${s.base}${s.prefix}/requests`, {
    method: 'POST', headers: { Authorization: `Bearer ${s.created.hostToken}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal((await readdir(join(s.directory, 'media'))).length, 0);
  assert.equal(s.store.read(s.created.session.code, s.created.hostToken).observations.length, 0);
  const atLimit = Buffer.alloc(5 * 1024 * 1024);
  png.copy(atLimit);
  assert.equal((await s.image(s.ali.participantToken, atLimit, randomUUID(), 'image', 'application/octet-stream')).status, 201);
});

test('text answers work; photos require images; mission requirements are validated', async (t) => {
  const s = await setup(t);
  const question = await s.request(s.ali.participantId, 'question');
  assert.equal((await s.post(`${s.prefix}/observations`, { requestId: question.id, text: '', mediaId: null }, s.ali.participantToken)).status, 400);
  const reply = await s.post(`${s.prefix}/observations`, { requestId: question.id, text: 'No name tags left.', mediaId: null }, s.ali.participantToken);
  assert.equal(reply.status, 201);
  const photo = await s.request();
  const noImage = await s.post(`${s.prefix}/observations`, { requestId: photo.id, text: 'Looks ready.', mediaId: null }, s.ali.participantToken);
  assert.equal(noImage.status, 400);
  assert.equal((await noImage.json()).error.code, 'IMAGE_REQUIRED');
  const duplicateIds = { ...mission, requirements: [mission.requirements[0], mission.requirements[0]] };
  assert.equal((await s.post(`${s.prefix}/missions`, duplicateIds, s.created.hostToken)).status, 400);
  assert.equal((await s.post(`${s.prefix}/missions`, { ...mission, requirements: [{ ...mission.requirements[0], quantity: 0 }] }, s.created.hostToken)).status, 400);
  const key = randomUUID();
  assert.equal((await s.post(`${s.prefix}/missions`, mission, s.created.hostToken, key)).status, 201);
  assert.equal((await s.post(`${s.prefix}/missions`, mission, s.created.hostToken, key)).status, 201);
  assert.equal((await s.post(`${s.prefix}/missions`, mission, s.created.hostToken)).status, 409);
});

test('failed persistence does not expose uncommitted state or leave uploaded files behind', async (t) => {
  const s = await setup(t);
  const path = join(s.directory, 'sessions.json');
  await rename(path, `${path}.backup`);
  await mkdir(path);
  const before = s.store.read(s.created.session.code, s.created.hostToken);
  assert.throws(() => s.store.createMission(s.created.session.code, s.created.hostToken, randomUUID(), mission));
  assert.deepEqual(s.store.read(s.created.session.code, s.created.hostToken), before);
  assert.throws(() => s.store.uploadMedia(s.created.session.code, s.ali.participantToken, randomUUID(), png, 'image/png'));
  assert.deepEqual(await readdir(join(s.directory, 'media')), []);
  await rm(path, { recursive: true });
  await rename(`${path}.backup`, path);
});

test('sessions written by the starter migrate without losing participants', async (t) => {
  const s = await setup(t);
  const path = join(s.directory, 'sessions.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  delete data[s.created.session.code].media;
  delete data[s.created.session.code].mutations;
  await writeFile(path, JSON.stringify(data));
  const migrated = new SessionStore(s.directory);
  const result = migrated.createRequest(s.created.session.code, s.created.hostToken, randomUUID(), {
    participantId: s.ali.participantId, kind: 'question', prompt: 'Ready?',
  });
  assert.equal(result.session.participants.length, 2);
  assert.equal(result.session.requests.length, 1);
});
