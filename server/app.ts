import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { HealthResponse } from '../shared/contracts';
import { SessionStore, StoreError } from './store';

const createInput = z.object({ title: z.string().trim().min(1).max(120).default('Meja workshop') });
const joinInput = z.object({ name: z.string().trim().min(1).max(60), zone: z.string().trim().min(1).max(80) });

export function createApp(store: SessionStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    const body: HealthResponse = { ok: true, service: 'pinjam', agent: 'not_configured' };
    response.json(body);
  });
  app.post('/api/sessions', (request, response) => {
    const input = createInput.parse(request.body ?? {});
    response.status(201).json(store.create(input.title));
  });
  app.post('/api/sessions/:code/join', (request, response) => {
    const input = joinInput.parse(request.body);
    response.status(201).json(store.join(request.params.code, input.name, input.zone));
  });
  app.get('/api/sessions/:code', (request, response) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length < 8) {
      throw new StoreError(401, 'UNAUTHORIZED', 'A valid session token is required.');
    }
    response.json({ session: store.read(request.params.code, authorization.slice(7)) });
  });
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API route is not implemented.' } });
  });

  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: { code: 'INVALID_INPUT', message: error.issues[0]?.message ?? 'Invalid input.' } });
    } else if (error instanceof StoreError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
    } else if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON body.' } });
    } else if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    } else {
      console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
      response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not complete the request.' } });
    }
  };
  app.use(errors);
  return app;
}
