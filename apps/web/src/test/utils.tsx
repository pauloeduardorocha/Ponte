import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from '../App';
import { setAccessToken } from '../lib/api';
import type { CurrentUser, Permission } from '../lib/types';

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
  credentials: RequestCredentials | undefined;
}

export type MockReply = { status?: number; body?: unknown };
type Handler = (request: RecordedRequest) => MockReply | Promise<MockReply>;

export const ADMIN_PERMISSIONS: Permission[] = [
  'USER_READ',
  'USER_CREATE',
  'USER_UPDATE',
  'MEMBER_READ',
  'MEMBER_CREATE',
  'MEMBER_UPDATE',
  'MEMBER_DELETE',
];
export const SECRETARY_PERMISSIONS: Permission[] = [
  'MEMBER_READ',
  'MEMBER_CREATE',
  'MEMBER_UPDATE',
];

export function makeUser(permissions: Permission[] = []): CurrentUser {
  return {
    id: 'user-1',
    email: 'ana@igreja.org',
    name: 'Ana Souza',
    status: 'ACTIVE',
    permissions,
  };
}

/**
 * Installs a fetch mock routed by "METHOD /path" (path relative to /api/v1).
 * Unknown routes answer 404. Returns the list of recorded requests.
 */
export function mockApi(routes: Record<string, Handler | MockReply>) {
  const requests: RecordedRequest[] = [];

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api\/v1/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      const request: RecordedRequest = {
        method,
        path,
        query: url.searchParams,
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
        credentials: init?.credentials,
      };
      requests.push(request);

      const route = routes[`${method} ${path}`];
      const reply: MockReply = route
        ? typeof route === 'function'
          ? await route(request)
          : route
        : { status: 404, body: { message: 'Not found' } };
      const status = reply.status ?? 200;

      return new Response(
        status === 204 || reply.body === undefined
          ? null
          : JSON.stringify(reply.body),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    },
  );

  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

/** Routes for a session restored through the refresh cookie. */
export function sessionRoutes(user: CurrentUser): Record<string, MockReply> {
  return {
    'POST /auth/refresh': { body: { accessToken: 'access-1', user } },
    'GET /auth/me': { body: user },
    'GET /health': { body: { status: 'ok' } },
    'POST /auth/logout': { status: 204 },
  };
}

export const anonymousRoutes: Record<string, MockReply> = {
  'POST /auth/refresh': { status: 401, body: { message: 'Unauthorized' } },
  'GET /health': { body: { status: 'ok' } },
};

export function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: media.includes('900px'),
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

export function resetTestState() {
  cleanup();
  setAccessToken(null);
  vi.unstubAllGlobals();
  stubMatchMedia();
}

export function renderApp(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
