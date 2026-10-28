import type { AuthSession } from './types';
import {
  recordApiRecovery,
  reportApiFailure,
} from './frontend-error-reporting';
import { messageAfterUpdateCheck } from './app-update';
import { NetworkFailure, networkRequest } from './network-request';
import {
  clearResponseCache,
  beginResponseCacheMutation,
  readResponseCache,
  rememberResponseTime,
  responseCacheTicket,
  writeResponseCache,
} from './response-cache';

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  0: 'Não foi possível conectar ao servidor.',
  400: 'Os dados enviados são inválidos.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para realizar esta ação.',
  404: 'Registro não encontrado.',
  409: 'Já existe um registro com estes dados.',
  413: 'Os documentos excedem o tamanho permitido. Reduza o tamanho dos ficheiros.',
  502: 'O servidor está temporariamente indisponível. Confira se o pedido foi guardado antes de tentar novamente.',
  503: 'O serviço está temporariamente indisponível. Confira se o pedido foi guardado antes de tentar novamente.',
  504: 'O servidor demorou a responder. Confira se o pedido foi guardado antes de tentar novamente.',
};
const GENERIC_ERROR_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

export function withErrorReference(message: string, data: unknown): string {
  const id =
    data && typeof data === 'object' && 'requestId' in data
      ? data.requestId
      : undefined;
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
    ? `${message} Referência: ${id}`
    : message;
}

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
  if (!token) void clearResponseCache();
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

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const generation = authGeneration;
  if (
    options.method &&
    options.method !== 'GET' &&
    !path.startsWith('/auth/') &&
    path !== '/frontend-errors'
  ) {
    const finish = await beginResponseCacheMutation();
    try {
      return await sendRequest(path, options, token, generation);
    } finally {
      await finish();
    }
  }
  return sendRequest(path, options, token, generation);
}

async function sendRequest(
  path: string,
  options: RequestOptions,
  token: string | null,
  generation: number,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const startedAt = performance.now();
  const uploadBytes =
    options.body instanceof FormData
      ? Array.from(options.body.values()).reduce(
          (total, value) => total + (value instanceof Blob ? value.size : 0),
          0,
        )
      : undefined;
  // Serialization errors are programming/validation failures, not network failures.
  const body =
    options.body instanceof FormData
      ? options.body
      : options.body === undefined
        ? undefined
        : JSON.stringify(options.body);
  const url = buildUrl(path, options.query);
  const cachePath = `${path}${new URL(url, window.location.origin).search}`;
  const reading = (options.method ?? 'GET') === 'GET';
  const cacheTicket = responseCacheTicket();
  if (reading && token) {
    const cached = await readResponseCache(url, cachePath, cacheTicket);
    if (cached && generation === authGeneration) return cached;
  }
  let response: Response;
  try {
    const result = await networkRequest(
      url,
      {
        method: options.method ?? 'GET',
        headers,
        body,
        credentials: 'include',
        cache: 'no-store',
      },
      () => generation === authGeneration,
      path === '/auth/refresh' ? 15_000 : undefined,
    );
    response = result.response;
    if (response.ok && result.attempts > 1)
      recordApiRecovery({
        path,
        attempts: result.attempts,
        durationMs: result.durationMs,
      });
  } catch (error) {
    if (!(error instanceof NetworkFailure)) throw error;
    const diagnostics = error.diagnostics;
    const uncertainWrite =
      options.method && options.method !== 'GET' && !path.startsWith('/auth/');
    if (diagnostics.kind === 'cancelled')
      throw new ApiError(0, 'A sessão mudou durante a consulta.', diagnostics);
    reportApiFailure({
      path,
      method: options.method ?? 'GET',
      message: `Falha de comunicação ao chamar API; tipo=${diagnostics.kind}; exceção=${diagnostics.exception}; duração=${diagnostics.durationMs}ms; tentativas=${diagnostics.attempts}; online=${diagnostics.online}; visibilidade=${diagnostics.visibility}.`,
    });
    throw new ApiError(
      0,
      await messageAfterUpdateCheck(
        diagnostics.kind === 'timeout'
          ? uncertainWrite
            ? 'O servidor demorou a responder. Confira se o pedido foi guardado antes de tentar novamente.'
            : 'O servidor demorou a responder. Tente novamente.'
          : diagnostics.kind === 'offline'
            ? 'Sem conexão. Tente novamente quando a rede voltar.'
            : uncertainWrite
              ? 'Falha de comunicação. Confira se o pedido foi guardado antes de tentar novamente.'
              : (DEFAULT_ERROR_MESSAGES[0] ?? GENERIC_ERROR_MESSAGE),
      ),
      diagnostics,
    );
  }

  if (!response.ok) {
    const data = await parseBody(response);
    const requestId =
      response.headers.get('x-request-id') ??
      response.headers.get('x-vercel-id') ??
      (data &&
      typeof data === 'object' &&
      'requestId' in data &&
      typeof data.requestId === 'string'
        ? data.requestId
        : undefined);
    const edgeCode = response.headers.get('x-vercel-error');
    const safeEdgeCode =
      edgeCode && /^[A-Z0-9_]{1,100}$/.test(edgeCode) ? edgeCode : 'unknown';
    reportApiFailure({
      path,
      method: options.method ?? 'GET',
      status: response.status,
      requestId,
      message: `A API respondeu com HTTP ${response.status}; duração=${Math.round(performance.now() - startedAt)}ms; redirecionado=${response.redirected}; anexosBytes=${uploadBytes ?? 0}; edgeCode=${safeEdgeCode}.`,
    });
    throw new ApiError(
      response.status,
      response.status >= 500
        ? await messageAfterUpdateCheck(
            withErrorReference(extractMessage(data, response.status), data),
          )
        : withErrorReference(extractMessage(data, response.status), data),
      data,
    );
  }
  if (reading && token && generation === authGeneration) {
    await writeResponseCache(url, cachePath, response, cacheTicket);
  }
  return response;
}

/**
 * Restores the session using the httpOnly refresh cookie.
 * Concurrent callers share the same in-flight request.
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshPromise ??= (async () => {
    const generation = authGeneration;
    try {
      const session = (await parseBody(
        await send(
          '/auth/refresh',
          { method: 'POST', skipAuthRefresh: true },
          null,
        ),
      )) as AuthSession;
      if (generation !== authGeneration) return null;
      accessToken = session.accessToken;
      return session;
    } catch (error) {
      if (generation !== authGeneration) return null;
      if (error instanceof ApiError && error.status === 401) {
        accessToken = null;
        return null;
      }
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
export async function apiResponse(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const token = accessToken;
  try {
    return await send(path, options, token);
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
      return send(path, options, accessToken);
    }
    const session = await refreshSession();
    if (!session) {
      sessionExpiredListeners.forEach((listener) => listener());
      throw error;
    }
    return send(path, options, session.accessToken);
  }
}

/** JSON counterpart of apiResponse, sharing authentication and error handling. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await apiResponse(path, options);
  const data = await parseBody(response);
  rememberResponseTime(data, response);
  return data as T;
}

/** Optional GET resources may be JSON null or an empty successful response. */
export async function apiNullableRequest<T>(path: string): Promise<T | null> {
  return (await apiRequest<T | null | undefined>(path)) ?? null;
}

export interface HealthResponse {
  status: 'ok';
}

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { skipAuthRefresh: true });
}
