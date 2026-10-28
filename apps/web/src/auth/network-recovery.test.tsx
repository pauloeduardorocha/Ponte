import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';
import { makeUser, mockApi, resetTestState } from '../test/utils';
import { createQueryClient } from '../lib/query-client';

beforeEach(resetTestState);
function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.status}</p>
      <p>{auth.user?.name}</p>
      <button onClick={() => auth.clearSession()}>Encerrar</button>
      <button onClick={() => void auth.login('test@example.test', 'password')}>
        Entrar
      </button>
    </>
  );
}

it('recovers initial session restoration on reconnect and clears cached private data on session end', async () => {
  let calls = 0;
  const user = { ...makeUser(), status: 'PENDING_APPROVAL' };
  mockApi({
    'POST /auth/refresh': () => {
      if (++calls === 1) throw new TypeError('connection lost');
      return { body: { accessToken: 'fresh', user } };
    },
    'GET /auth/me': { body: user },
  });
  const client = createQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('anonymous');
  fireEvent(window, new Event('online'));
  await screen.findByText('authenticated');
  expect(calls).toBe(2);
  client.setQueryData(['finance', 'accounts'], ['private']);
  client.setQueryData(['library', 'loans'], ['private']);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
  await screen.findByText('anonymous');
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  fireEvent(window, new Event('online'));
  expect(calls).toBe(2);
  view.unmount();
  client.clear();
});

it('removes the previous account cache before a new manual login', async () => {
  const user = { ...makeUser(), status: 'PENDING_APPROVAL' };
  mockApi({
    'POST /auth/refresh': { status: 401 },
    'POST /auth/login': { body: { accessToken: 'fresh', user } },
    'GET /auth/me': { body: user },
  });
  const client = createQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('anonymous');
  client.setQueryData(['finance', 'accounts'], ['old account']);
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() =>
    expect(client.getQueryData(['finance', 'accounts'])).toBeUndefined(),
  );
  await screen.findByText('authenticated');
  view.unmount();
  client.clear();
});
