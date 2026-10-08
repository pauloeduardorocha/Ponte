import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../lib/types';
import {
  ADMIN_PERMISSIONS,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
} from '../test/utils';
import { sessionRoutes } from '../test/utils';

const others: User[] = [
  { id: 'u2', name: 'Bruno Dias', email: 'bruno@igreja.org', status: 'ACTIVE' },
  {
    id: 'u3',
    name: 'Carla Reis',
    email: 'carla@igreja.org',
    status: 'DISABLED',
  },
];

describe('Users', () => {
  beforeEach(resetTestState);

  it('loads existing roles and saves multiple roles while blocking higher permissions', async () => {
    const current = makeUser(['USER_READ', 'PERMISSION_MANAGE']);
    const requests = mockApi({
      ...sessionRoutes(current),
      'GET /users': {
        body: { items: [current, ...others], total: 3, page: 1, pageSize: 10 },
      },
      'GET /users/roles': {
        body: [
          { id: 'r1', name: 'MEMBER', assignable: true },
          { id: 'r2', name: 'SECRETARY', assignable: true },
          { id: 'r3', name: 'SUPER_ADMIN', assignable: false },
        ],
      },
      'GET /users/u2/roles': { body: [{ id: 'r1', name: 'MEMBER' }] },
      'PATCH /users/u2/roles': { body: { id: 'u2', roles: [] } },
    });
    renderApp('/users');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerir roles de Bruno Dias' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('checkbox', { name: 'MEMBER' }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole('checkbox', { name: 'SUPER_ADMIN' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Gerir roles de Ana Souza' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'SECRETARY' }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Salvar roles' }),
    );
    expect(
      await screen.findByText('Roles de Bruno Dias atualizadas.'),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      roleIds: ['r1', 'r2'],
    });
  });

  it('keeps the dialog open and shows server errors when role changes fail', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['USER_READ', 'PERMISSION_MANAGE'])),
      'GET /users': {
        body: { items: others, total: 2, page: 1, pageSize: 10 },
      },
      'GET /users/roles': {
        body: [{ id: 'r1', name: 'MEMBER', assignable: true }],
      },
      'GET /users/u2/roles': { body: [{ id: 'r1', name: 'MEMBER' }] },
      'PATCH /users/u2/roles': {
        status: 409,
        body: { message: 'Preserve ao menos um administrador ativo' },
      },
    });
    renderApp('/users');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Gerir roles de Bruno Dias' }),
    );
    const checkbox = await screen.findByRole('checkbox', { name: 'MEMBER' });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar roles' }));
    expect(
      await screen.findByText('Preserve ao menos um administrador ativo'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lists users and toggles their status', async () => {
    const current = makeUser(ADMIN_PERMISSIONS);
    const requests = mockApi({
      ...sessionRoutes(current),
      'GET /users': {
        body: { items: [current, ...others], total: 3, page: 1, pageSize: 10 },
      },
      'PATCH /users/u2/status': { body: { ...others[0], status: 'DISABLED' } },
      'PATCH /users/u3/status': { body: { ...others[1], status: 'ACTIVE' } },
    });
    renderApp('/users');

    expect(await screen.findByText('Bruno Dias')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Ana Souza/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Desativar Bruno Dias' }),
    );
    expect(
      await screen.findByText('Usuário Bruno Dias desativado.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar Carla Reis' }));
    expect(
      await screen.findByText('Usuário Carla Reis ativado.'),
    ).toBeInTheDocument();

    const patches = requests.filter((r) => r.method === 'PATCH');
    expect(patches.map((r) => [r.path, r.body])).toEqual([
      ['/users/u2/status', { status: 'DISABLED' }],
      ['/users/u3/status', { status: 'ACTIVE' }],
    ]);
    const list = requests.find((r) => r.path === '/users');
    expect(list?.query.get('page')).toBe('1');
    expect(list?.query.get('pageSize')).toBe('10');
  });

  it('creates a user without roles', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(ADMIN_PERMISSIONS)),
      'GET /users': {
        body: { items: others, total: 2, page: 1, pageSize: 10 },
      },
      'POST /users': {
        status: 201,
        body: {
          id: 'u4',
          name: 'Davi',
          email: 'davi@igreja.org',
          status: 'ACTIVE',
        },
      },
    });
    renderApp('/users');

    fireEvent.click(
      await screen.findByRole('button', { name: /Novo usuário/ }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Nome/), {
      target: { value: 'Davi' },
    });
    fireEvent.change(within(dialog).getByLabelText(/E-mail/), {
      target: { value: 'davi@igreja.org' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Senha inicial/), {
      target: { value: 'segredo123456' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Criar usuário' }),
    );

    await waitFor(() =>
      expect(
        requests.find((r) => r.method === 'POST' && r.path === '/users')?.body,
      ).toEqual({
        name: 'Davi',
        email: 'davi@igreja.org',
        password: 'segredo123456',
      }),
    );
  });

  it('hides management actions when only USER_READ is granted', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['USER_READ'])),
      'GET /users': {
        body: { items: others, total: 2, page: 1, pageSize: 10 },
      },
    });
    renderApp('/users');

    expect(await screen.findByText('Bruno Dias')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Novo usuário/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Desativar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Gerir roles/ }),
    ).not.toBeInTheDocument();
  });
});
