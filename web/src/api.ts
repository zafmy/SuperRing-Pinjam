import type {
  ApiErrorBody, CreateSessionInput, CreateSessionResponse, GetSessionResponse,
  HealthResponse, JoinSessionInput, JoinSessionResponse,
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

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/health', { signal }),
  createSession: (input: CreateSessionInput = {}) => request<CreateSessionResponse>('/sessions', { method: 'POST', body: JSON.stringify(input) }),
  joinSession: (code: string, input: JoinSessionInput) => request<JoinSessionResponse>(`/sessions/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify(input) }),
  getSession: (code: string, token: string, signal?: AbortSignal) => request<GetSessionResponse>(`/sessions/${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}` }, signal }),
};
