import { fireEvent, screen } from '@testing-library/react';
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
  it('requires access to every sensitive domain before loading audit data', async () => {
    const requests = mockApi({ ...sessionRoutes(makeUser(['AUDIT_READ'])) });
    renderApp('/audit');
    expect(
      await screen.findByText(
        'Você não tem permissão para consultar a auditoria.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/audit')).toBe(false);
    expect(
      screen.queryByRole('link', { name: 'Auditoria' }),
    ).not.toBeInTheDocument();
  });
  it('shows immutable before/after records without mutation actions', async () => {
    mockApi({
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
  });
});
