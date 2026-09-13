import { Router, type Request } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { MAX_IMAGE_BYTES, SessionStore, StoreError } from './store';

const upload = multer({ storage: multer.memoryStorage(), limits: {
  // Busboy signals limits when reached. Allow the final boundary and inspect exact size below.
  fileSize: MAX_IMAGE_BYTES + 1, files: 1, fields: 0, parts: 2,
} }).single('image');
const id = z.string().uuid();
const requirement = z.object({ id: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(100) });
const missionInput = z.object({ goal: z.string().trim().min(1).max(2000), requirements: z.array(requirement).min(1).max(20)
  .refine((items) => new Set(items.map((entry) => entry.id)).size === items.length, 'Requirement IDs must be unique.') });
const requestInput = z.object({ participantId: id, kind: z.enum(['photo', 'question']), prompt: z.string().trim().min(1).max(2000) });
const observationInput = z.object({ requestId: id, text: z.string().trim().max(2000), mediaId: id.nullable() });

export function bearer(request: Request) {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ') || value.length < 8) throw new StoreError(401, 'UNAUTHORIZED', 'A valid session token is required.');
  return value.slice(7);
}

export function idempotencyKey(request: Request) {
  const key = request.get('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new StoreError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key of 8–128 letters, numbers, dots, colons, underscores or hyphens.');
  }
  return key;
}

export function evidenceRoutes(store: SessionStore) {
  const router = Router();
  router.post('/:code/missions', (request, response) => {
    const token = bearer(request);
    store.authorize(request.params.code, token, 'host');
    response.status(201).json(store.createMission(request.params.code, token, idempotencyKey(request), missionInput.parse(request.body)));
  });
  router.post('/:code/requests', (request, response) => {
    const token = bearer(request);
    store.authorize(request.params.code, token, 'host');
    response.status(201).json(store.createRequest(request.params.code, token, idempotencyKey(request), requestInput.parse(request.body)));
  });
  router.post('/:code/media', (request, _response, next) => {
    store.authorize(z.string().parse(request.params.code), bearer(request), 'participant');
    idempotencyKey(request);
    next();
  }, (request, response, next) => {
    upload(request, response, (error) => {
      if (!error || error instanceof multer.MulterError) return next(error);
      next(new StoreError(400, 'INVALID_UPLOAD', 'Send valid multipart form data with one image field.'));
    });
  }, async (request, response) => {
    if (!request.file || request.file.size === 0) throw new StoreError(400, 'IMAGE_REQUIRED', 'Upload one image in the image field.');
    if (request.file.size > MAX_IMAGE_BYTES) throw new StoreError(413, 'PAYLOAD_TOO_LARGE', 'Image must be no larger than 5 MiB.');
    let type;
    try { type = await fileTypeFromBuffer(request.file.buffer); } catch {
      throw new StoreError(415, 'UNSUPPORTED_IMAGE', 'This file is not a recognized JPEG, PNG or WebP image.');
    }
    if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
      throw new StoreError(415, 'UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP image.');
    }
    response.status(201).json(store.uploadMedia(z.string().parse(request.params.code), bearer(request), idempotencyKey(request), request.file.buffer, type.mime));
  });
  router.get('/:code/media/:mediaId', (request, response) => {
    const media = store.readMedia(request.params.code, bearer(request), id.parse(request.params.mediaId));
    response.setHeader('Content-Type', media.mime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.send(media.buffer);
  });
  router.post('/:code/observations', (request, response) => {
    const token = bearer(request);
    store.authorize(request.params.code, token, 'participant');
    response.status(201).json(store.submitObservation(request.params.code, token, idempotencyKey(request), observationInput.parse(request.body)));
  });
  router.post('/:code/tasks/:taskId/respond', (request, response) => {
    const input = z.object({ action: z.enum(['accept', 'decline', 'start', 'report_done']), note: z.string().trim().max(2000).optional() }).parse(request.body);
    response.json(store.respondToTask(request.params.code, bearer(request), idempotencyKey(request), id.parse(request.params.taskId), input));
  });
  router.post('/:code/participants/:participantId/remove', (request, response) => {
    response.json(store.removeParticipant(request.params.code, bearer(request), idempotencyKey(request), id.parse(request.params.participantId)));
  });
  return router;
}
