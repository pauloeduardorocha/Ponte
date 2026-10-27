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
          logs: [{ message: 'Contexto do erro' }],
        },
      },
    });
    renderApp('/audit/errors');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver erro' }));
    expect(
      await screen.findByText('Stack completa do erro'),
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
