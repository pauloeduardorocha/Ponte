import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { makeUser, mockApi, resetTestState } from '../test/utils';
import { useLiveTranslation } from './live-translation';

describe('Translation lease expiration', () => {
  beforeEach(resetTestState);
  it('hides an expired session even before the next server poll', async () => {
    const expiresAt = new Date(Date.now() + 1500).toISOString();
    mockApi({
      'GET /live-translation/status': {
        body: {
          active: true,
          audienceUrl: 'http://192.168.1.2:3210/listen/' + 'a'.repeat(24),
          expiresAt,
        },
      },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ user: makeUser() } as AuthContextValue}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    const result = renderHook(useLiveTranslation, { wrapper });
    await waitFor(() => expect(result.result.current.active).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
    });
    expect(result.result.current.active).toBe(false);
    result.unmount();
    client.clear();
    vi.unstubAllGlobals();
  });
});
