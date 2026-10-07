import type { AuthSession } from './types';

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  0: 'Não foi possível conectar ao servidor.',
  400: 'Os dados enviados são inválidos.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'Registro não encontrado.',
  409: 'Já existe um registro com estes dados.',
};
const GENERIC_ERROR_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Disables the automatic refresh-and-retry on 401 responses. */
  skipAuthRefresh?: boolean;
}

let accessToken: string | null = null;
let authGeneration = 0;
let refreshPromise: Promise<AuthSession | null> | null = null;
const sessionExpiredListeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

/** Access token lives only in memory; it is never persisted to storage. */
export function setAccessToken(token: string | null): void {
  authGeneration++;
  accessToken = token;
}

/** Subscribes to session expiration (refresh failed after a 401). */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `${API_URL}${path}${search ? `?${search}` : ''}`;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const { message } = data as { message: unknown };
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.map(String).join(' ');
    }
  }
  return DEFAULT_ERROR_MESSAGES[status] ?? GENERIC_ERROR_MESSAGE;
}

async function send<T>(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, DEFAULT_ERROR_MESSAGES[0] ?? GENERIC_ERROR_MESSAGE);
  }

  const data = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(data, response.status),
      data,
    );
  }
  return data as T;
}

/**
 * Restores the session using the httpOnly refresh cookie.
 * Concurrent callers share the same in-flight request.
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshPromise ??= (async () => {
    const generation = authGeneration;
    try {
      const session = await send<AuthSession>(
        '/auth/refresh',
        { method: 'POST', skipAuthRefresh: true },
        null,
      );
      if (generation !== authGeneration) return null;
      accessToken = session.accessToken;
      return session;
    } catch (error) {
      if (generation !== authGeneration) return null;
      accessToken = null;
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * Performs an authenticated API request. On 401 it refreshes the access token
 * once and retries; if the refresh fails, session-expired listeners are notified.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = accessToken;
  try {
    return await send<T>(path, options, token);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      options.skipAuthRefresh ||
      !token
    ) {
      throw error;
    }
    if (accessToken && accessToken !== token) {
      return send<T>(path, options, accessToken);
    }
    const session = await refreshSession();
    if (!session) {
      sessionExpiredListeners.forEach((listener) => listener());
      throw error;
    }
    return send<T>(path, options, session.accessToken);
  }
}

export interface HealthResponse {
  status: 'ok';
}

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { skipAuthRefresh: true });
}
