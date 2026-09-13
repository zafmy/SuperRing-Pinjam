import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { SessionStore } from './store';
import { createApp } from './app';
import { commandCodePlanner, type Planner } from './agent';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'pinjam-agent-'));
  const store = new SessionStore(directory);
  const { session, hostToken } = store.create('Workshop');
  const participant = store.join(session.code, 'Ali', 'Bekalan');
  const other = store.join(session.code, 'Mira', 'Meja');
  const code = session.code;
  const mission = () => store.createMission(code, hostToken, 'mission-key', { goal: 'Sediakan meja', requirements: [{ id: 'pen', label: 'Pen', quantity: 3 }] });
  return { directory, store, code, hostToken, participant, other, mission, clean: () => rmSync(directory, { recursive: true, force: true }) };
}

async function serve(store: SessionStore, planner?: Planner) {
  const server = createApp(store, planner).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('host step requires mission, authenticates roles, persists retries and rejects stale model actions', async () => {
  const x = setup(); let calls = 0; let changeDuringPlan = false;
  const api = await serve(x.store, async () => {
    calls++;
    if (changeDuringPlan) x.store.join(x.code, 'Late arrival', 'Door');
    return { action: 'request', participantId: x.participant.participantId, kind: 'photo', prompt: 'Ambil gambar bekalan', summary: 'Perlu lihat bekalan.' };
  });
  const step = (token: string, key: string) => fetch(`${api.base}/sessions/${x.code}/agent/step`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key } });
  try {
    assert.equal((await step(x.participant.participantToken, 'step-key-1')).status, 403);
    assert.equal((await step(x.hostToken, 'step-key-1')).status, 409);
    assert.equal(calls, 0); x.mission();
    const result = await step(x.hostToken, 'step-key-1'); assert.equal(result.status, 200);
    assert.equal((await result.json()).session.requests.length, 1);
    assert.equal((await step(x.hostToken, 'step-key-1')).status, 200); assert.equal(calls, 1);
    assert.equal(new SessionStore(x.directory).agentResult(x.code, x.hostToken, 'step-key-1')?.action, 'request');
    changeDuringPlan = true;
    const stale = await step(x.hostToken, 'step-key-2');
    assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, 'AGENT_STALE');
    assert.equal(x.store.read(x.code, x.hostToken).requests.length, 1);
  } finally { await api.close(); x.clean(); }
});

test('task consent, source integrity and fresh visual verification gates hold through mission completion', async () => {
  const x = setup();
  try {
    x.mission();
    let serial = 0;
    const photo = async () => {
      await new Promise((resolve) => setTimeout(resolve, 3));
      const key = `photo-${++serial}`;
      const view = x.store.createRequest(x.code, x.hostToken, key + '-request', { participantId: x.participant.participantId, kind: 'photo', prompt: 'Gambar baharu' }).session;
      const media = x.store.uploadMedia(x.code, x.participant.participantToken, key + '-upload', Buffer.from('test image bytes'), 'image/png');
      return x.store.submitObservation(x.code, x.participant.participantToken, key + '-answer', { requestId: view.requests.at(-1)!.id, text: '3 pen di meja', mediaId: media.mediaId }).session.observations.at(-1)!;
    };
    const apply = (decision: Parameters<SessionStore['applyAgentDecision']>[4], visible: string[] = []) => x.store.applyAgentDecision(x.code, x.hostToken, `agent-key-${++serial}`, x.store.read(x.code, x.hostToken).revision, decision, visible);
    const initial = await photo();
    const offer = () => apply({ action: 'offer_task', participantId: x.participant.participantId, title: 'Bawa pen ke meja', sourceObservationIds: [initial.id], summary: 'Tawarkan bantuan.' }).session.tasks.at(-1)!;
    const first = offer();
    assert.throws(() => x.store.respondToTask(x.code, x.other.participantToken, 'wrong-user', first.id, { action: 'accept' }), /assigned/);
    assert.throws(() => x.store.respondToTask(x.code, x.participant.participantToken, 'early-done', first.id, { action: 'report_done' }), /state/);
    x.store.respondToTask(x.code, x.participant.participantToken, 'decline-key', first.id, { action: 'decline', note: 'Tak boleh sekarang' });
    assert.throws(() => x.store.respondToTask(x.code, x.participant.participantToken, 'accept-late', first.id, { action: 'accept' }), /state/);
    const task = offer();
    x.store.respondToTask(x.code, x.participant.participantToken, 'accept-key', task.id, { action: 'accept' });
    x.store.respondToTask(x.code, x.participant.participantToken, 'report-key', task.id, { action: 'report_done' });
    const verify = (id: string) => ({ action: 'verify_task' as const, taskId: task.id, sourceObservationIds: [id], summary: 'Gambar menunjukkan hasil.' });
    assert.throws(() => apply(verify(initial.id), [initial.id]), /newer photo/);
    const fresh = await photo();
    assert.throws(() => apply(verify(fresh.id)), /newer photo/);
    apply(verify(fresh.id), [fresh.id]);
    const final = await photo();
    assert.throws(() => apply({ action: 'complete_mission', sourceObservationIds: [final.id], requirementIds: ['wrong'], summary: 'Siap' }, [final.id]), /Every mission requirement/);
    const completed = apply({ action: 'complete_mission', sourceObservationIds: [final.id], requirementIds: ['pen'], summary: '3 pen disemak pada meja.' }, [final.id]);
    assert.equal(completed.session.mission?.status, 'completed');
    assert.equal(completed.session.tasks[0].status, 'declined');
    assert.equal(completed.session.tasks[1].status, 'completed');
  } finally { x.clean(); }
});

test('CommandCode adapter sends selected model/images/tools and hides upstream secrets on failure', async () => {
  const x = setup();
  try {
    const context = { session: x.store.read(x.code, x.hostToken), images: [{ observationId: 'image-id', dataUrl: 'data:image/png;base64,AAAA' }] };
    const planner = commandCodePlanner({ CMD_API_KEY: 'private-key', AI_MODEL: 'gpt-5.5' }, async (url, options) => {
      assert.equal(url, 'https://api.commandcode.ai/provider/v1/chat/completions');
      const body = JSON.parse(options!.body as string);
      assert.equal(body.model, 'gpt-5.5'); assert.equal(body.tool_choice.function.name, 'take_action');
      assert.ok(JSON.stringify(body).includes('data:image/png;base64,AAAA'));
      assert.ok(!JSON.stringify(body).includes(x.hostToken));
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'take_action', arguments: JSON.stringify({ action: 'wait', summary: 'Tunggu peserta.' }) } }] } }] });
    })!;
    assert.equal((await planner(context)).action, 'wait');
    const bad = commandCodePlanner({ CMD_API_KEY: 'private-key' }, async () => new Response('private-key', { status: 401 }))!;
    await assert.rejects(bad(context), (error: Error) => !error.message.includes('private-key') && error.message.includes('401'));
    const malformed = commandCodePlanner({ CMD_API_KEY: 'private-key' }, async () => Response.json({ choices: [] }))!;
    await assert.rejects(malformed(context), /tidak sah/);
    assert.equal(commandCodePlanner({}), undefined);
    assert.throws(() => commandCodePlanner({ CMD_API_KEY: 'private-key', AI_BASE_URL: 'https://elsewhere.example' }), /CommandCode/);
  } finally { x.clean(); }
});

test('missing provider returns an actionable error and concurrent steps make only one model call', async () => {
  const x = setup(); x.mission();
  const offline = await serve(x.store);
  const step = (base: string, key: string) => fetch(`${base}/sessions/${x.code}/agent/step`, { method: 'POST', headers: { Authorization: `Bearer ${x.hostToken}`, 'Idempotency-Key': key } });
  try { assert.equal((await step(offline.base, 'offline-key')).status, 503); } finally { await offline.close(); }
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
  let calls = 0;
  const api = await serve(x.store, async () => { calls++; entered(); await gate; return { action: 'wait', summary: 'Tunggu.' }; });
  try {
    const first = step(api.base, 'busy-key-one'); await started;
    assert.equal((await step(api.base, 'busy-key-two')).status, 409);
    release(); assert.equal((await first).status, 200); assert.equal(calls, 1);
  } finally { release(); await api.close(); x.clean(); }
});
