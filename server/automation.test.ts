import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './store';
import { AgentRunner } from './automation';
import type { Planner } from './agent';
import { createApp } from './app';
import type { AddressInfo } from 'node:net';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'pinjam-auto-'));
  const store = new SessionStore(directory);
  const { session, hostToken: token } = store.create('Workshop');
  const code = session.code;
  const person = store.join(code, 'Ali', 'Meja');
  const mission = store.createMission(code, token, 'mission-init', { goal: '3 pen di meja', requirements: [{ id: 'pens', label: 'Pen', quantity: 3 }] }).session.mission!;
  let serial = 0;
  const photo = async () => {
    await new Promise((resolve) => setTimeout(resolve, 3));
    const request = store.read(code, token).requests.find((item) => item.status === 'pending')!;
    const media = store.uploadMedia(code, person.participantToken, `upload-${++serial}`, Buffer.from('test'), 'image/png');
    store.submitObservation(code, person.participantToken, `answer-${serial}`, { requestId: request.id, mediaId: media.mediaId, text: '3 pen' });
  };
  return { directory, store, token, code, person, mission, photo, clean: () => rmSync(directory, { recursive: true, force: true }) };
}

test('automatic mission runs until completion and never calls model again while waiting on unchanged input', async () => {
  const x = setup(); let calls = 0;
  const planner: Planner = async ({ session }) => {
    calls++;
    const observation = session.observations.at(-1);
    const task = session.tasks[0];
    if (!observation || (task?.status === 'needs_verification' && session.observations.length === 1) || (task?.status === 'completed' && session.observations.length === 2)) return { action: 'request', participantId: x.person.participantId, kind: 'photo', prompt: 'Gambar baharu meja', summary: 'Perlu bukti baharu.' };
    if (!task) return { action: 'offer_task', participantId: x.person.participantId, title: 'Susun pen', sourceObservationIds: [observation.id], summary: 'Tawaran tugasan.' };
    if (task.status === 'needs_verification') return { action: 'verify_task', taskId: task.id, sourceObservationIds: [observation.id], summary: 'Tugasan disemak.' };
    return { action: 'complete_mission', sourceObservationIds: [observation.id], requirementIds: ['pens'], summary: 'Misi selesai.' };
  };
  const runner = new AgentRunner(x.store, planner, 60_000);
  try {
    runner.start(x.code, x.token, 'auto-start', x.mission.id, 30);
    await runner.tick(x.code); assert.equal(calls, 1);
    await runner.tick(x.code); assert.equal(calls, 1);
    assert.equal(x.store.read(x.code, x.token).automation?.status, 'waiting');
    await x.photo(); await runner.tick(x.code); assert.equal(calls, 2);
    const task = x.store.read(x.code, x.token).tasks[0];
    x.store.respondToTask(x.code, x.person.participantToken, 'accept-task', task.id, { action: 'accept' });
    x.store.respondToTask(x.code, x.person.participantToken, 'report-task', task.id, { action: 'report_done' });
    await runner.tick(x.code); assert.equal(calls, 3);
    await x.photo(); await runner.tick(x.code); assert.equal(calls, 4);
    await runner.tick(x.code); assert.equal(calls, 5);
    await x.photo(); await runner.tick(x.code); assert.equal(calls, 6);
    const done = x.store.read(x.code, x.token);
    assert.equal(done.mission?.status, 'completed'); assert.equal(done.automation?.enabled, false);
    assert.equal(done.automation?.status, 'completed'); assert.equal(done.automation?.steps, 6);
    await runner.tick(x.code); assert.equal(calls, 6);
    assert.ok(!readFileSync(join(x.directory, 'sessions.json'), 'utf8').includes(x.token));
  } finally { runner.close(); x.clean(); }
});

test('stop and reset invalidate in-flight decisions, preserve participants, and reject delayed resets of a new mission', async () => {
  const x = setup(); let release!: () => void; let signal: AbortSignal | undefined;
  const planner: Planner = async (_context, abort) => { signal = abort; await new Promise<void>((resolve) => { release = resolve; }); return { action: 'request', participantId: x.person.participantId, kind: 'photo', prompt: 'Old request', summary: 'Old result' }; };
  const runner = new AgentRunner(x.store, planner, 60_000);
  try {
    runner.start(x.code, x.token, 'start-run', x.mission.id, 30);
    const tick = runner.tick(x.code);
    x.store.stopAgent(x.code, x.token, 'stop-run', x.mission.id); runner.abort(x.code, x.mission.id);
    assert.equal(signal?.aborted, true); release(); await tick;
    assert.equal(x.store.read(x.code, x.token).requests.length, 0);
    const manual = runner.manualStep(x.code, x.token, 'manual-old');
    x.store.resetMission(x.code, x.token, 'reset-key', x.mission.id); runner.abort(x.code, x.mission.id);
    release(); await assert.rejects(manual, /dihentikan/);
    const fresh = x.store.createMission(x.code, x.token, 'mission-new', { goal: 'New mission', requirements: [{ id: 'book', label: 'Book', quantity: 1 }] }).session;
    assert.equal(fresh.participants.length, 1); assert.equal(fresh.observations.length, 0); assert.equal(fresh.tasks.length, 0);
    assert.equal(x.store.resetMission(x.code, x.token, 'reset-key', x.mission.id).session.mission?.id, fresh.mission?.id);
    assert.throws(() => x.store.resetMission(x.code, x.token, 'reset-new-key', x.mission.id), /berubah/);
    const disk = JSON.parse(readFileSync(join(x.directory, 'sessions.json'), 'utf8'))[x.code];
    assert.equal(disk.archives[0].mission.id, x.mission.id);
    assert.equal(x.store.read(x.code, x.person.participantToken).mission?.id, fresh.mission?.id);
  } finally { runner.close(); x.clean(); }
});

test('automatic errors, limits and server restarts halt instead of retrying forever', async () => {
  const x = setup(); let calls = 0;
  const runner = new AgentRunner(x.store, async () => { calls++; throw new Error('private provider details'); }, 60_000);
  try {
    runner.start(x.code, x.token, 'error-start', x.mission.id, 30);
    await runner.tick(x.code); await runner.tick(x.code);
    assert.equal(calls, 1); assert.equal(x.store.read(x.code, x.token).automation?.status, 'error');
    assert.ok(!JSON.stringify(x.store.read(x.code, x.token)).includes('private provider details'));
  } finally { runner.close(); }
  const limited = new AgentRunner(x.store, async () => ({ action: 'wait', summary: 'Tunggu.' }), 60_000);
  try {
    limited.start(x.code, x.token, 'limit-start', x.mission.id, 1);
    await limited.tick(x.code); await limited.tick(x.code);
    assert.equal(x.store.read(x.code, x.token).automation?.status, 'limit_reached');
    limited.start(x.code, x.token, 'restart-start', x.mission.id, 30);
  } finally { limited.close(); }
  const loaded = new SessionStore(x.directory); const restarted = new AgentRunner(loaded, undefined, 60_000);
  try { assert.equal(loaded.read(x.code, x.token).automation?.enabled, false); assert.match(loaded.read(x.code, x.token).automation!.message, /Pelayan dimulakan semula/); }
  finally { restarted.close(); x.clean(); }
});

test('reset/start/stop HTTP routes require host access and start retries cannot restart a stopped run', async () => {
  const x = setup();
  const app = createApp(x.store, async () => ({ action: 'wait', summary: 'Tunggu' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sessions/${x.code}`;
  const post = (path: string, token: string, key: string) => fetch(`${url}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ missionId: x.mission.id, maxSteps: 2 }) });
  try {
    for (const path of ['/agent/start', '/agent/stop', '/missions/reset']) assert.equal((await post(path, x.person.participantToken, 'unauthorized')).status, 403);
    assert.equal((await post('/agent/start', x.token, 'start-http')).status, 200);
    assert.equal((await post('/agent/stop', x.token, 'stop-http')).status, 200);
    const retry = await (await post('/agent/start', x.token, 'start-http')).json();
    assert.equal(retry.session.automation.enabled, false);
    assert.equal((await post('/missions/reset', x.token, 'reset-http')).status, 200);
  } finally { app.locals.agentRunner.close(); await new Promise<void>((resolve) => server.close(() => resolve())); x.clean(); }
});

test('a participant decline wakes automatic replanning and leaves the original task declined', async () => {
  const x = setup();
  const second = x.store.join(x.code, 'Mira', 'Bekalan');
  x.store.createRequest(x.code, x.token, 'initial-request', { participantId: x.person.participantId, kind: 'photo', prompt: 'Photo' });
  await x.photo(); let calls = 0;
  const runner = new AgentRunner(x.store, async ({ session }) => {
    calls++;
    const declined = session.tasks.some((task) => task.status === 'declined');
    return { action: 'offer_task', participantId: declined ? second.participantId : x.person.participantId, title: 'Bawa pen', sourceObservationIds: [session.observations[0].id], summary: declined ? 'Minta bantuan Mira selepas Ali menolak.' : 'Tawarkan kepada Ali.' };
  }, 60_000);
  try {
    runner.start(x.code, x.token, 'replan-start', x.mission.id, 30); await runner.tick(x.code);
    const first = x.store.read(x.code, x.token).tasks[0];
    await runner.tick(x.code); assert.equal(calls, 1);
    x.store.respondToTask(x.code, x.person.participantToken, 'decline-replan', first.id, { action: 'decline', note: 'Tak boleh tinggalkan meja' });
    await runner.tick(x.code); assert.equal(calls, 2);
    const tasks = x.store.read(x.code, x.token).tasks;
    assert.equal(tasks[0].status, 'declined'); assert.equal(tasks[1].participantId, second.participantId); assert.equal(tasks[1].status, 'offered');
  } finally { runner.close(); x.clean(); }
});


test('removal revokes credentials durably, cancels work and preserves evidence with idempotent host-only access', async () => {
  const x = setup();
  const other = x.store.join(x.code, 'Mira', 'Door');
  const app = createApp(x.store);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sessions/${x.code}/participants/${x.person.participantId}/remove`;
  const remove = (token: string) => fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'remove-person' } });
  try {
    x.store.createRequest(x.code, x.token, 'initial-photo', { participantId: x.person.participantId, kind: 'photo', prompt: 'Photo' });
    await x.photo();
    const before = x.store.read(x.code, x.token);
    x.store.applyAgentDecision(x.code, x.token, 'offer-before-kick', before.revision, { action: 'offer_task', participantId: x.person.participantId, title: 'Bawa pen', sourceObservationIds: [before.observations[0].id], summary: 'Offer' }, []);
    x.store.createRequest(x.code, x.token, 'pending-photo', { participantId: x.person.participantId, kind: 'photo', prompt: 'Photo again' });
    assert.equal((await remove(other.participantToken)).status, 403);
    assert.equal((await remove(x.store.create('Other session').hostToken)).status, 401);
    assert.equal((await remove(x.token)).status, 200);
    assert.equal((await remove(x.token)).status, 200);
    const after = x.store.read(x.code, other.participantToken);
    assert.deepEqual(after.participants.map(p => p.id), [other.participantId]);
    assert.equal(after.tasks[0].status, 'cancelled');
    assert.equal(after.requests.at(-1)!.status, 'cancelled');
    assert.equal(after.observations.length, 1);
    assert.equal(after.events.filter(e => e.kind === 'participant_removed').length, 1);
    assert.throws(() => x.store.read(x.code, x.person.participantToken), { code: 'UNAUTHORIZED' });
    assert.throws(() => x.store.removeParticipant(x.code, x.token, 'remove-again', x.person.participantId), { code: 'PARTICIPANT_NOT_FOUND' });
    assert.throws(() => new SessionStore(x.directory).read(x.code, x.person.participantToken), { code: 'UNAUTHORIZED' });
  } finally { app.locals.agentRunner.close(); await new Promise<void>((resolve) => server.close(() => resolve())); x.clean(); }
});

test('removing the last participant discards in-flight work and waits for a new join before replanning', async () => {
  const x = setup(); let release!: () => void; let calls = 0;
  const runner = new AgentRunner(x.store, async ({ session }) => {
    calls++;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    return { action: 'request', participantId: session.participants[0].id, kind: 'photo', prompt: 'Photo', summary: 'Check' };
  }, 60_000);
  try {
    runner.start(x.code, x.token, 'start-before-kick', x.mission.id, 30);
    const pending = runner.tick(x.code);
    x.store.removeParticipant(x.code, x.token, 'kick-last', x.person.participantId);
    release(); await pending;
    await runner.tick(x.code); assert.equal(calls, 1);
    assert.equal(x.store.read(x.code, x.token).requests.length, 0);
    assert.equal(x.store.read(x.code, x.token).automation?.status, 'waiting');
    const newcomer = x.store.join(x.code, 'New volunteer', 'Door');
    await runner.tick(x.code); assert.equal(calls, 2);
    assert.equal(x.store.read(x.code, x.token).requests[0].participantId, newcomer.participantId);
  } finally { runner.close(); x.clean(); }
});
