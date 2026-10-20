import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
const member = {
  id: 'm2',
  name: 'Bruno Dias',
  email: 'bruno@igreja.org',
  status: 'ACTIVE',
  phone: null,
  birthDate: null,
  notes: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  user: {
    id: 'u2',
    name: 'Bruno Dias',
    email: 'bruno@igreja.org',
    status: 'ACTIVE',
  },
};
describe('Unified member accounts', () => {
  beforeEach(resetTestState);
  it('redirects the old user list to members', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ'])),
      'GET /members': {
        body: { items: [member], total: 1, page: 1, pageSize: 10 },
      },
    });
    renderApp('/users');
    expect(await screen.findByText('Bruno Dias')).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/users')).toBe(false);
  });
  it('manages roles directly from the member and blocks superior roles', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ', 'PERMISSION_MANAGE'])),
      'GET /members/m2': { body: member },
      'GET /users/roles': {
        body: [
          { id: 'r1', name: 'MEMBER', assignable: true },
          { id: 'r2', name: 'SECRETARY', assignable: true },
          { id: 'r3', name: 'SUPER_ADMIN', assignable: false },
        ],
      },
      'GET /users/u2/roles': { body: [{ id: 'r1', name: 'MEMBER' }] },
      'PATCH /users/u2/roles': { body: {} },
    });
    renderApp('/members/m2');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerenciar roles' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    expect(
      await dialog.findByRole('checkbox', { name: 'MEMBER' }),
    ).toBeChecked();
    expect(
      dialog.getByRole('checkbox', { name: 'SUPER_ADMIN' }),
    ).toBeDisabled();
    fireEvent.click(dialog.getByRole('checkbox', { name: 'SECRETARY' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar roles' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        roleIds: ['r1', 'r2'],
      }),
    );
  });
  it('changes access status and sets a password through the member', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ', 'USER_UPDATE'])),
      'GET /members/m2': { body: member },
      'PATCH /users/u2/status': { body: {} },
      'POST /users/u2/password': { body: {} },
    });
    renderApp('/members/m2');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Desativar acesso' }),
    );
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        status: 'DISABLED',
      }),
    );
    fireEvent.change(screen.getByLabelText('Nova senha de acesso'), {
      target: { value: 'new-password-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha' }));
    expect(await screen.findByText('Senha definida.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/users/u2/password')?.body).toEqual(
      { password: 'new-password-2026' },
    );
  });
  it('hides account management without administrative permissions', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ'])),
      'GET /members/m2': { body: member },
    });
    renderApp('/members/m2');
    expect(await screen.findByText('Acesso à plataforma')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Gerenciar roles' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Desativar acesso' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Nova senha de acesso'),
    ).not.toBeInTheDocument();
  });
});
