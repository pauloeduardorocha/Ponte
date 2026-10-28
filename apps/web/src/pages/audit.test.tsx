import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { AUDIT_PERMISSIONS } from '../lib/audit-permissions';
describe('Audit access', () => {
  beforeEach(resetTestState);
  it.each(['/audit', '/audit/errors'])(
    'requires all audit permissions before loading %s',
    async (route) => {
      const requests = mockApi({ ...sessionRoutes(makeUser(['AUDIT_READ'])) });
      renderApp(route);
      expect(
        await screen.findByText(
          'Você não tem permissão para acessar esta área.',
        ),
      ).toBeInTheDocument();
      expect(requests.some((r) => r.path.startsWith('/audit'))).toBe(false);
      expect(
        screen.queryByRole('link', { name: 'Registros de auditoria' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Erros de frontend' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Auditoria' }),
      ).not.toBeInTheDocument();
    },
  );
  it('shows immutable before/after records without mutation actions', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(AUDIT_PERMISSIONS)),
      'GET /audit': {
        body: {
          total: 1,
          items: [
            {
              id: 'log-1',
              action: 'DATA_Member_UPDATE',
              entity: 'Member',
              createdAt: '2026-10-07T12:00:00Z',
              oldValues: { name: 'Antes' },
              newValues: { name: 'Depois' },
              userId: 'operator',
              ip: '127.0.0.1',
            },
          ],
        },
      },
    });
    renderApp('/audit');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver alteração' }),
    );
    expect(screen.getByText(/"name": "Antes"/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "Depois"/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Excluir|Apagar|Editar/ }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path === '/audit/frontend-errors')).toBe(
      false,
    );
    expect(
      screen.queryByRole('table', { name: 'Erros de frontend' }),
    ).not.toBeInTheDocument();
  });
  it('loads frontend error details on demand and requests the next backend page', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(AUDIT_PERMISSIONS)),
      'GET /audit': { body: { items: [], total: 0 } },
      'GET /audit/frontend-errors': {
        body: {
          total: 26,
          items: [
            {
              id: 'error-1',
              occurredAt: '2026-10-27T12:00:00Z',
              eventType: 'runtime',
              message: 'Falha de teste',
              userId: 'account-1',
              user: {
                id: 'account-1',
                name: 'Usuário de teste',
                memberId: 'member-9',
              },
              route: '/',
              device: { appVersion: '1.1.1' },
            },
          ],
        },
      },
      'GET /audit/frontend-errors/error-1': {
        body: {
          id: 'error-1',
          stack: 'Stack completa do erro',
          userId: 'account-1',
          user: {
            id: 'account-1',
            name: 'Usuário de teste',
            memberId: 'member-9',
          },
          logs: [{ message: 'Contexto do erro' }],
        },
      },
    });
    renderApp('/audit/errors');
    expect(
      await screen.findByRole('link', { name: 'Usuário de teste' }),
    ).toHaveAttribute('href', '/members/member-9');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver erro' }));
    expect(
      await screen.findByText('Stack completa do erro'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: 'Usuário de teste',
      }),
    ).toHaveAttribute('href', '/members/member-9');
    expect(
      within(screen.getByRole('dialog')).getByText('account-1'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    const next = await screen.findAllByRole('button', {
      name: /next page|pr.xima p.gina|p.gina seguinte/i,
    });
    fireEvent.click(next[next.length - 1]!);
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.path === '/audit/frontend-errors' &&
            r.query.get('page') === '2' &&
            r.query.get('pageSize') === '25',
        ),
      ).toBe(true),
    );
    expect(
      requests.some((r) => r.path === '/audit/frontend-errors/error-1'),
    ).toBe(true);
    expect(requests.some((r) => r.path === '/audit')).toBe(false);
  });
  it('does not create user links for anonymous reports or accounts without a member', async () => {
    mockApi({
      ...sessionRoutes(makeUser(AUDIT_PERMISSIONS)),
      'GET /audit/frontend-errors': {
        body: {
          total: 2,
          items: [
            {
              id: 'a',
              occurredAt: '2026-10-28T12:00:00Z',
              eventType: 'api',
              message: 'Network error',
              route: '/',
              userId: null,
              user: null,
            },
            {
              id: 'b',
              occurredAt: '2026-10-28T12:00:00Z',
              eventType: 'runtime',
              message: 'Runtime error',
              route: '/',
              userId: 'account-only',
              user: {
                id: 'account-only',
                name: 'Conta isolada',
                memberId: null,
              },
            },
          ],
        },
      },
    });
    renderApp('/audit/errors');
    expect(await screen.findByText('Não identificado')).toBeInTheDocument();
    expect(
      screen.getByText('Conta isolada (sem cadastro associado)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Conta isolada/ }),
    ).not.toBeInTheDocument();
  });
  it('groups both pages under Auditoria and selects only the current page', async () => {
    mockApi({
      ...sessionRoutes(makeUser(AUDIT_PERMISSIONS)),
      'GET /audit': { body: { items: [], total: 0 } },
      'GET /audit/frontend-errors': { body: { items: [], total: 0 } },
    });
    renderApp('/audit');
    const group = await screen.findByRole('list', { name: 'Auditoria' });
    const audit = within(group).getByRole('link', {
      name: 'Registros de auditoria',
    });
    const errors = within(group).getByRole('link', {
      name: 'Erros de frontend',
    });
    expect(audit).toHaveAttribute('href', '/audit');
    expect(audit).toHaveAttribute('aria-current', 'page');
    expect(errors).not.toHaveAttribute('aria-current');
    fireEvent.click(errors);
    expect(
      await screen.findByRole('heading', { name: 'Erros de frontend' }),
    ).toBeInTheDocument();
    expect(errors).toHaveAttribute('aria-current', 'page');
    expect(audit).not.toHaveAttribute('aria-current');
    expect(
      screen.queryByRole('table', { name: 'Registros de auditoria' }),
    ).not.toBeInTheDocument();
  });
});
