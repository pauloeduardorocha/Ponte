import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAccessToken } from './lib/api';
import {
  ADMIN_PERMISSIONS,
  SECRETARY_PERMISSIONS,
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from './test/utils';

async function change(label: RegExp | string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
}

describe('Authentication', () => {
  beforeEach(resetTestState);

  it('redirects anonymous visitors to the login page', async () => {
    mockApi(anonymousRoutes);
    renderApp('/members');

    expect(
      await screen.findByRole('heading', { name: 'Acesse sua conta' }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['/login', '/members'])(
    'surfaces restoration failures as errors on %s',
    async (route) => {
      mockApi({
        'POST /auth/refresh': {
          status: 503,
          body: { message: 'Servidor indisponível' },
        },
      });
      renderApp(route);
      expect(
        await screen.findByText('Servidor indisponível'),
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveClass('MuiAlert-colorError');
    },
  );

  it('warns when logout cannot confirm server revocation and still clears local data', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'POST /auth/logout': { status: 503 },
    });
    renderApp('/');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir menu da conta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /Sair/ }));
    expect(
      await screen.findByText(
        /não foi possível confirmar a revogação no servidor/,
      ),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('logs in, keeps the token in memory and loads permissions from /auth/me', async () => {
    const user = makeUser(SECRETARY_PERMISSIONS);
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/login': { body: { accessToken: 'access-login', user } },
      'GET /auth/me': { body: user },
      'GET /members': { body: { items: [], total: 4, page: 1, pageSize: 1 } },
    });
    renderApp('/login');

    await change(/E-mail/, 'ana@igreja.org');
    await change(/^Senha/, 'segredo123');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByRole('heading', { name: /Bom dia, comunidade/ }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBe('access-login');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    const login = requests.find((r) => r.path === '/auth/login');
    expect(login?.body).toEqual({
      email: 'ana@igreja.org',
      password: 'segredo123',
    });
    expect(login?.credentials).toBe('include');
    const me = requests.find((r) => r.path === '/auth/me');
    expect(me?.headers.Authorization).toBe('Bearer access-login');

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getByText('Membros')).toBeInTheDocument();
    expect(within(nav).queryByText('Usuários')).not.toBeInTheDocument();
  });

  it('shows a friendly error for invalid credentials', async () => {
    mockApi({
      ...anonymousRoutes,
      'POST /auth/login': { status: 401, body: { message: 'Unauthorized' } },
    });
    renderApp('/login');

    await change(/E-mail/, 'ana@igreja.org');
    await change(/^Senha/, 'errada123');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('E-mail ou senha inválidos.'),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('restores the session from the refresh cookie on load', async () => {
    const requests = mockApi(sessionRoutes(makeUser(ADMIN_PERMISSIONS)));
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: /Bom dia, comunidade/ }),
    ).toBeInTheDocument();
    const refresh = requests.find((r) => r.path === '/auth/refresh');
    expect(refresh?.method).toBe('POST');
    expect(refresh?.body).toBeUndefined();
    expect(refresh?.credentials).toBe('include');
    expect(getAccessToken()).toBe('access-1');
  });

  it('logs out, calls the API and clears the in-memory token', async () => {
    const requests = mockApi(sessionRoutes(makeUser()));
    renderApp('/');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir menu da conta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /Sair/ }));

    expect(
      await screen.findByRole('heading', { name: 'Acesse sua conta' }),
    ).toBeInTheDocument();
    expect(
      requests.some((r) => r.method === 'POST' && r.path === '/auth/logout'),
    ).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  it('registers without logging in and without sending roles', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/register': {
        status: 201,
        body: {
          id: 'u2',
          email: 'novo@igreja.org',
          name: 'Novo',
          status: 'ACTIVE',
        },
      },
    });
    renderApp('/register');

    await change(/^Nome/, 'Novo');
    await change(/E-mail/, 'novo@igreja.org');
    await change(/^Senha/, 'segredo123456');
    await change(/Confirmar senha/, 'segredo123456');
    fireEvent.click(await screen.findByRole('button', { name: /Criar conta/ }));

    expect(
      await screen.findByText(
        'Conta criada com sucesso. Entre com seus dados.',
      ),
    ).toBeInTheDocument();
    const registration = requests.find((r) => r.path === '/auth/register');
    expect(registration?.body).toEqual({
      name: 'Novo',
      email: 'novo@igreja.org',
      password: 'segredo123456',
    });
    expect(requests.some((r) => r.path === '/auth/me')).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('validates password confirmation on registration', async () => {
    const requests = mockApi(anonymousRoutes);
    renderApp('/register');

    await change(/^Nome/, 'Novo');
    await change(/E-mail/, 'novo@igreja.org');
    await change(/^Senha/, 'segredo123456');
    await change(/Confirmar senha/, 'outra12345678');
    fireEvent.click(await screen.findByRole('button', { name: /Criar conta/ }));

    expect(await screen.findByText(/senhas não conferem/i)).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/auth/register')).toBe(false);
  });

  it('shows the generic message returned by forgot-password', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/forgot-password': {
        body: { message: 'Se o e-mail existir, enviaremos instruções.' },
      },
    });
    renderApp('/forgot-password');

    await change(/E-mail/, 'ana@igreja.org');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enviar instruções' }),
    );

    expect(
      await screen.findByText('Se o e-mail existir, enviaremos instruções.'),
    ).toBeInTheDocument();
    expect(
      requests.find((r) => r.path === '/auth/forgot-password')?.body,
    ).toEqual({
      email: 'ana@igreja.org',
    });
  });

  it('resets the password with the token from the link', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/reset-password': { body: { message: 'ok' } },
    });
    renderApp('/reset-password?token=abc123');

    await change(/^Nova senha/, 'novaSenha1234');
    await change(/Confirmar nova senha/, 'novaSenha1234');
    fireEvent.click(await screen.findByRole('button', { name: /Redefinir/ }));

    expect(
      await screen.findByText('Senha redefinida. Entre com a nova senha.'),
    ).toBeInTheDocument();
    expect(
      requests.find((r) => r.path === '/auth/reset-password')?.body,
    ).toEqual({
      token: 'abc123',
      newPassword: 'novaSenha1234',
    });
  });

  it('changes the password and ends the local session', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'PATCH /auth/password': { status: 204 },
    });
    renderApp('/account');

    await change(/Senha atual/, 'antiga123');
    await change(/^Nova senha/, 'novaSenha1234');
    await change(/Confirmar nova senha/, 'novaSenha1234');
    fireEvent.click(
      await screen.findByRole('button', { name: /Alterar senha/ }),
    );

    expect(
      await screen.findByText(
        'Senha alterada. Entre novamente com a nova senha.',
      ),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/password')?.body).toEqual({
      currentPassword: 'antiga123',
      newPassword: 'novaSenha1234',
    });
    expect(getAccessToken()).toBeNull();
  });
});

describe('Permissions', () => {
  beforeEach(resetTestState);

  it('hides member and user navigation for the MEMBER role', async () => {
    mockApi(sessionRoutes(makeUser([])));
    renderApp('/');

    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    expect(within(nav).getByText('Visão geral')).toBeInTheDocument();
    expect(within(nav).queryByText('Membros')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Usuários')).not.toBeInTheDocument();
  });

  it('shows all management navigation for ADMIN', async () => {
    mockApi({
      ...sessionRoutes(makeUser(ADMIN_PERMISSIONS)),
      'GET /members': { body: { items: [], total: 0, page: 1, pageSize: 1 } },
    });
    renderApp('/');

    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    expect(within(nav).getByText('Membros')).toBeInTheDocument();
    expect(within(nav).getByText('Usuários')).toBeInTheDocument();
  });

  it('keeps functional groups ordered for combined permissions without duplicate links', async () => {
    mockApi(
      sessionRoutes(
        makeUser([
          'MEMBER_READ',
          'MINISTRY_READ',
          'EVENT_READ',
          'EVENT_REGISTRATION_READ',
          'EVENT_CREATE',
          'SCHEDULE_READ',
          'LIBRARY_BOOK_READ',
          'NOTIFICATION_READ',
          'USER_READ',
        ]),
      ),
    );
    renderApp('/account');

    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((el) => el.textContent),
    ).toEqual([
      'Pessoas',
      'Grupos e ministérios',
      'Eventos',
      'Operação',
      'Recursos',
      'Comunicação',
      'Administração',
    ]);
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    for (const button of within(nav).getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    }
    const links = within(nav).getAllByRole('link');
    expect(new Set(links.map((link) => link.getAttribute('href'))).size).toBe(
      links.length,
    );
    expect(links[0]).toHaveTextContent('Visão geral');
    for (const button of within(nav).getAllByRole('button')) {
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    await waitFor(() =>
      expect(within(nav).getAllByRole('link')).toHaveLength(1),
    );
  });

  it('omits empty groups for users without management permissions', async () => {
    mockApi(sessionRoutes(makeUser([])));
    renderApp('/account');
    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
  });

  it.each([
    ['/my-events', 'Meus eventos'],
    ['/my-events?section=registrations', 'Inscrições'],
    ['/my-events?create=true', 'Criar evento'],
  ])('selects only the current event shortcut on %s', async (route, label) => {
    mockApi(
      sessionRoutes(makeUser(['EVENT_REGISTRATION_READ', 'EVENT_CREATE'])),
    );
    renderApp(route);
    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    const active = nav.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent(label);
  });

  it('blocks direct access to routes without permission', async () => {
    const requests = mockApi(sessionRoutes(makeUser([])));
    renderApp('/members');

    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/members')).toBe(false);
  });

  it('blocks the users page for SECRETARY', async () => {
    mockApi(sessionRoutes(makeUser(SECRETARY_PERMISSIONS)));
    renderApp('/users');

    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
  });
});
