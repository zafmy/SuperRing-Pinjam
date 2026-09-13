import type {
  ApiErrorBody, CreateRequestInput, CreateSessionInput, CreateSessionResponse,
  GetSessionResponse, HealthResponse, JoinSessionInput, JoinSessionResponse,
  SubmitObservationInput,
} from '../../shared/contracts';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) {
    const failure = body as ApiErrorBody;
    throw new ApiError(response.status, failure.error?.code ?? 'REQUEST_FAILED', failure.error?.message ?? 'Request failed.');
  }
  return body as T;
}

function authenticatedJson<T>(path: string, token: string, idempotencyKey: string, input: unknown) {
  return request<T>(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

async function uploadImage(path: string, token: string, idempotencyKey: string, image: File) {
  const form = new FormData();
  form.append('image', image);
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey },
    body: form,
  });
  const body = await response.json();
  if (!response.ok) {
    const failure = body as ApiErrorBody;
    throw new ApiError(response.status, failure.error?.code ?? 'REQUEST_FAILED', failure.error?.message ?? 'Request failed.');
  }
  return body as { mediaId: string };
}

async function getImage(path: string, token: string, signal?: AbortSignal) {
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? 'Could not load image.');
  }
  return response.blob();
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/health', { signal }),
  createSession: (input: CreateSessionInput = {}) => request<CreateSessionResponse>('/sessions', { method: 'POST', body: JSON.stringify(input) }),
  joinSession: (code: string, input: JoinSessionInput) => request<JoinSessionResponse>(`/sessions/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify(input) }),
  getSession: (code: string, token: string, signal?: AbortSignal) => request<GetSessionResponse>(`/sessions/${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}` }, signal }),
  createRequest: (code: string, token: string, idempotencyKey: string, input: CreateRequestInput) => authenticatedJson<GetSessionResponse>(`/sessions/${encodeURIComponent(code)}/requests`, token, idempotencyKey, input),
  uploadMedia: (code: string, token: string, idempotencyKey: string, image: File) => uploadImage(`/sessions/${encodeURIComponent(code)}/media`, token, idempotencyKey, image),
  submitObservation: (code: string, token: string, idempotencyKey: string, input: SubmitObservationInput) => authenticatedJson<GetSessionResponse>(`/sessions/${encodeURIComponent(code)}/observations`, token, idempotencyKey, input),
  getMedia: (code: string, token: string, mediaId: string, signal?: AbortSignal) => getImage(`/sessions/${encodeURIComponent(code)}/media/${encodeURIComponent(mediaId)}`, token, signal),
};
