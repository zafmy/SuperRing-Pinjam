import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { commandCodePlanner } from './agent';
import { SessionStore } from './store';

const port = Number(process.env.PORT ?? 3001);
const store = new SessionStore(resolve(process.env.DATA_DIR ?? '.data'));
const planner = commandCodePlanner();
const app = createApp(store, planner);
const webDirectory = resolve('dist/web');

if (existsSync(webDirectory)) {
  app.use(express.static(webDirectory));
  app.get('/{*path}', (_request, response) => response.sendFile(resolve(webDirectory, 'index.html')));
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`PINJAM server is ready on port ${port}. Agent: ${planner ? 'CommandCode configured; awaiting host step' : 'not configured (CMD_API_KEY missing)'}.`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
