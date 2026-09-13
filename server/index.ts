import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { SessionStore } from './store';

const port = Number(process.env.PORT ?? 3001);
const store = new SessionStore(resolve(process.env.DATA_DIR ?? '.data'));
const app = createApp(store);
const webDirectory = resolve('dist/web');

if (existsSync(webDirectory)) {
  app.use(express.static(webDirectory));
  app.get('/{*path}', (_request, response) => response.sendFile(resolve(webDirectory, 'index.html')));
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`PINJAM server is ready on port ${port}. Agent integration is not configured yet.`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
