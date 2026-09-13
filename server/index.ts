import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { commandCodePlanner } from './agent';
import { SessionStore } from './store';
import { PushService } from './push';

const port = Number(process.env.PORT ?? 3001);
const store = new SessionStore(resolve(process.env.DATA_DIR ?? '.data'));
const planner = commandCodePlanner();
const push = new PushService(store, resolve(process.env.DATA_DIR ?? '.data'), process.env.VAPID_SUBJECT);
const app = createApp(store, planner, push);
const webDirectory = resolve('dist/web');

if (existsSync(webDirectory)) {
  app.use(express.static(webDirectory));
  app.get('/{*path}', (_request, response) => response.sendFile(resolve(webDirectory, 'index.html')));
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`PINJAM server is ready on port ${port}. Agent: ${planner ? 'CommandCode configured; manual and automatic controls ready' : 'not configured (CMD_API_KEY missing)'}.`);
});
const shutdown = () => { app.locals.agentRunner.close(); push.close(); server.close(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
