import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './app';
import { SessionStore } from './store';

let directory: string;
let base: string;
let stop: () => Promise<void>;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pinjam-test-'));
  const server = createApp(new SessionStore(directory)).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  stop = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('two participants share one persisted session; snapshots contain no credentials', async () => {
  const created = await post('/sessions', { title: 'Workshop' });
  assert.equal(created.status, 201);
  const { session, hostToken } = await created.json();
  const ali = await (await post(`/sessions/${session.code}/join`, { name: 'Ali', zone: 'Bekalan' })).json();
  const mira = await (await post(`/sessions/${session.code}/join`, { name: 'Mira', zone: 'Pendaftaran' })).json();
  const response = await fetch(`${base}/sessions/${session.code}`, { headers: { Authorization: `Bearer ${ali.participantToken}` } });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.session.participants.length, 2);
  assert.equal(snapshot.session.revision, 2);
  assert.equal(snapshot.session.events.length, 2);
  for (const secret of [hostToken, ali.participantToken, mira.participantToken]) {
    assert.ok(!JSON.stringify(snapshot).includes(secret));
    assert.ok(!(await readFile(join(directory, 'sessions.json'), 'utf8')).includes(secret));
  }
  const reloaded = new SessionStore(directory).read(session.code, hostToken);
  assert.equal(reloaded.participants.length, 2);
});

test('session code alone and credentials from another session cannot read a session', async () => {
  const first = await (await post('/sessions', {})).json();
  const second = await (await post('/sessions', {})).json();
  const missing = await fetch(`${base}/sessions/${first.session.code}`);
  assert.equal(missing.status, 401);
  const wrong = await fetch(`${base}/sessions/${first.session.code}`, { headers: { Authorization: `Bearer ${second.hostToken}` } });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error.code, 'UNAUTHORIZED');
});

test('invalid input, missing sessions and unimplemented routes fail explicitly', async () => {
  const created = await (await post('/sessions', {})).json();
  const invalid = await post(`/sessions/${created.session.code}/join`, { name: ' ', zone: 'Bekalan' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT');
  assert.equal((await post('/sessions/DOESNOTEXIST/join', { name: 'Ali', zone: 'Bekalan' })).status, 404);
  const planned = await post(`/sessions/${created.session.code}/tasks/unused/respond`, {});
  assert.equal(planned.status, 404);
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.agent, 'not_configured');
});

test('malformed JSON has a consistent client error instead of a server failure', async () => {
  const response = await fetch(`${base}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});
