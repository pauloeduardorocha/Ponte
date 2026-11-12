import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { TranslationAdminPage } from './TranslationAdminPage';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  anonymousRoutes,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

const inactive = { active: false, audienceUrl: null, expiresAt: null };
describe('Live translation in the Ponte PWA', () => {
  beforeEach(resetTestState);
  it('offers visitors a login-page button and Wi-Fi warning only during an active translation', async () => {
    const audienceUrl = 'http://192.168.1.20:3210/listen/' + 'a'.repeat(24);
    const requests = mockApi({
      ...anonymousRoutes,
      'GET /live-translation/public-status': {
        body: {
          active: true,
          audienceUrl,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        },
      },
    });
    renderApp('/login');
    const button = await screen.findByRole('link', {
      name: 'Ouvir tradução ao vivo — sem entrar',
    });
    expect(
      screen.getByText(/É preciso estar conectado ao Wi-Fi da igreja/),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(
      await screen.findByRole('link', { name: 'Abrir tradução ao vivo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir tradução ao vivo' }),
    ).toHaveAttribute('href', audienceUrl);
    expect(
      screen.queryByRole('link', { name: 'Ouvir com o ecrã bloqueado' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir tradução ao vivo' }),
    ).not.toHaveAttribute('target', '_blank');
    expect(
      requests.some((request) => request.path === '/live-translation/status'),
    ).toBe(false);
  });
  it('does not advertise inactive or expired broadcasts on the login page', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'GET /live-translation/public-status': {
        body: {
          active: true,
          audienceUrl: 'http://192.168.1.2:3210/listen/' + 'a'.repeat(24),
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.path === '/live-translation/public-status',
        ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole('link', {
        name: 'Ouvir tradução ao vivo — sem entrar',
      }),
    ).not.toBeInTheDocument();
  });
  it('opens the public listening page directly without requiring an account', async () => {
    mockApi({
      ...anonymousRoutes,
      'GET /live-translation/public-status': { body: inactive },
    });
    renderApp('/listen-translation');
    expect(
      await screen.findByText(
        /Aguardando a transmissão/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Voltar ao login' }),
    ).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
  });
  it('hides the menu when no session is published', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'GET /live-translation/status': { body: inactive },
    });
    renderApp('/live-translation');
    expect(
      await screen.findByText(
        /Aguardando a transmissão/,
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Navegação principal' }),
      ).queryByRole('link', { name: 'Tradução ao vivo' }),
    ).not.toBeInTheDocument();
  });
  it('offers one same-tab player for authenticated listeners without fetching audio from the API', async () => {
    const audienceUrl = 'http://192.168.1.20:3210/listen/' + 'a'.repeat(24);
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'GET /live-translation/status': {
        body: {
          active: true,
          audienceUrl,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        },
      },
    });
    renderApp('/live-translation');
    expect(
      await screen.findByRole('link', { name: 'Abrir tradução ao vivo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir tradução ao vivo' }),
    ).toHaveAttribute('href', audienceUrl);
    expect(
      screen.getByRole('link', { name: 'Tradução ao vivo' }),
    ).toHaveAttribute('href', '/live-translation');
    expect(
      requests
        .filter((request) => request.path.startsWith('/live-translation/'))
        .map((request) => request.path),
    ).toEqual(['/live-translation/status']);
  });
  it('denies the administration page before requesting download or credentials', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'GET /live-translation/status': { body: inactive },
    });
    renderApp('/translation-app');
    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
    expect(
      requests.some((request) => /download|credential/.test(request.path)),
    ).toBe(false);
  });
  it('lets an administrator download the release and generate a one-time pairing configuration', async () => {
    const user = { ...makeUser(), roles: ['ADMIN'] };
    const requests = mockApi({
      ...sessionRoutes(user),
      'GET /live-translation/status': { body: inactive },
      'GET /live-translation/download': {
        body: {
          url: 'https://downloads.example/ponte.zip',
          localAvailable: false,
        },
      },
      'POST /live-translation/credential': { body: { token: 'b'.repeat(64) } },
    });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ user } as AuthContextValue}>
          <TranslationAdminPage />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole(
        'link',
        {
          name: 'Baixar aplicativo para Windows',
        },
        { timeout: 15000 },
      ),
    ).toHaveAttribute('href', 'https://downloads.example/ponte.zip');
    fireEvent.click(
      screen.getByRole('button', { name: 'Gerar ligação para o computador' }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Ligação do aplicativo') as HTMLInputElement)
          .value,
      ).toContain('"token":"' + 'b'.repeat(64)),
    );
    expect(
      requests.filter(
        (request) => request.path === '/live-translation/credential',
      ),
    ).toHaveLength(1);
  });
});
