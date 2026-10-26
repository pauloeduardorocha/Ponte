import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@church/shared';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { canAccessRoute } from '../auth/route-access';

const pending = { ...makeUser([]), status: 'PENDING_APPROVAL' as const };
beforeEach(resetTestState);
describe('Pending approval access', () => {
  it.each([
    '/finance',
    '/library',
    '/operations',
    '/events',
    '/inbox',
    '/reimbursements',
    '/pedir-reembolso',
    '/pending-approvals',
  ])('blocks %s without requesting restricted data', async (path) => {
    const requests = mockApi(sessionRoutes(pending));
    renderApp(path);
    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
    expect(requests.filter((r) => !r.path.startsWith('/auth/'))).toEqual([]);
    expect(
      canAccessRoute(path, PERMISSIONS, { ...pending, roles: ['ADMIN'] }),
    ).toBe(false);
  });
  it('shows only videos and birthdays on the pending dashboard', async () => {
    const requests = mockApi({
      ...sessionRoutes(pending),
      'GET /community/birthdays': {
        body: [{ id: 'b', name: 'Aniversariante' }],
      },
      'GET /videos': { body: { items: [], stale: false } },
    });
    renderApp('/');
    expect(
      await screen.findByText(/Sua conta está aguardando aprovação/),
    ).toBeInTheDocument();
    expect(await screen.findByText('Aniversariante')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Financeiro' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Biblioteca' }),
    ).not.toBeInTheDocument();
    expect(
      requests.filter(
        (r) =>
          ![
            '/auth/refresh',
            '/auth/me',
            '/videos',
            '/community/birthdays',
          ].includes(r.path),
      ),
    ).toEqual([]);
  });
  it.each(['ADMIN', 'SUPER_ADMIN', 'PASTOR'])(
    'allows %s to approve from the waiting list',
    async (role) => {
      let approved = false;
      const user = { ...makeUser([]), roles: [role] };
      const requests = mockApi({
        ...sessionRoutes(user),
        'GET /users/pending-approvals': () => ({
          body: {
            items: approved
              ? []
              : [
                  {
                    id: 'p',
                    name: 'Novo cadastro',
                    email: 'new@example.test',
                    createdAt: '2026-10-20',
                    member: {
                      phone: '+351 912345678',
                      birthDate: '1990-05-20',
                    },
                  },
                ],
            total: approved ? 0 : 1,
            page: 1,
            pageSize: 20,
          },
        }),
        'POST /users/p/approve': () => {
          approved = true;
          return { body: { id: 'p', status: 'ACTIVE' } };
        },
      });
      renderApp('/pending-approvals');
      expect(
        await screen.findByText('Telefone: +351 912345678'),
      ).toBeInTheDocument();
      expect(screen.getByText('Nascimento: 20/05/1990')).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Aprovar Novo cadastro' }),
      );
      expect(
        await screen.findByText('Conta aprovada com acesso padrão de membro.'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Aprovar Novo cadastro' }),
        ).not.toBeInTheDocument(),
      );
      expect(requests.some((r) => r.path === '/users/p/approve')).toBe(true);
    },
  );
  it('does not allow ordinary members to read the waiting list', async () => {
    const requests = mockApi(
      sessionRoutes(makeUser(['USER_READ', 'USER_UPDATE'])),
    );
    renderApp('/pending-approvals');
    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/users/pending-approvals')).toBe(
      false,
    );
  });
});
