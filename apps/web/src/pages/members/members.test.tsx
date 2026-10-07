import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Member } from '../../lib/types';
import {
  ADMIN_PERMISSIONS,
  SECRETARY_PERMISSIONS,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
  type RecordedRequest,
} from '../../test/utils';

const member: Member = {
  id: 'm1',
  name: 'Maria Lima',
  email: 'maria@igreja.org',
  phone: '11999990000',
  status: 'ACTIVE',
  birthDate: '1990-05-20',
  notes: 'Ministério de louvor',
  createdAt: '2024-01-10T12:00:00.000Z',
  updatedAt: '2024-02-10T12:00:00.000Z',
};

function membersPage(request: RecordedRequest) {
  return {
    body: {
      items: [member],
      total: 30,
      page: Number(request.query.get('page') ?? 1),
      pageSize: Number(request.query.get('pageSize') ?? 10),
    },
  };
}

function lastListQuery(requests: RecordedRequest[]) {
  const list = requests.filter(
    (r) => r.method === 'GET' && r.path === '/members',
  );
  return list[list.length - 1]?.query;
}

describe('Members', () => {
  beforeEach(resetTestState);

  it('lists members and drives search, filter, sorting and pagination through the API', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(ADMIN_PERMISSIONS)),
      'GET /members': membersPage,
    });
    renderApp('/members');

    expect(await screen.findByText('Maria Lima')).toBeInTheDocument();
    expect(lastListQuery(requests)?.toString()).toBe(
      'page=1&pageSize=10&sortBy=name&sortOrder=asc',
    );

    fireEvent.change(screen.getByLabelText('Buscar'), {
      target: { value: 'mar' },
    });
    await waitFor(() =>
      expect(lastListQuery(requests)?.get('search')).toBe('mar'),
    );

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Inativos' }));
    await waitFor(() =>
      expect(lastListQuery(requests)?.get('status')).toBe('INACTIVE'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Nome' }));
    await waitFor(() =>
      expect(lastListQuery(requests)?.get('sortOrder')).toBe('desc'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrado em' }));
    await waitFor(() =>
      expect(lastListQuery(requests)?.get('sortBy')).toBe('createdAt'),
    );

    fireEvent.click(screen.getByRole('button', { name: /next page|próxima/i }));
    await waitFor(() => expect(lastListQuery(requests)?.get('page')).toBe('2'));
    expect(lastListQuery(requests)?.get('search')).toBe('mar');
    expect(lastListQuery(requests)?.get('status')).toBe('INACTIVE');
  });

  it('hides create/edit/delete actions for users without those permissions', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ'])),
      'GET /members': membersPage,
      'GET /members/m1': { body: member },
    });
    renderApp('/members');

    expect(await screen.findByText('Maria Lima')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Novo membro/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Editar Maria Lima' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Ver Maria Lima' }));
    expect(
      await screen.findByRole('heading', { name: 'Maria Lima' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Editar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Excluir/ }),
    ).not.toBeInTheDocument();
  });

  it('shows member details without delete for SECRETARY', async () => {
    mockApi({
      ...sessionRoutes(makeUser(SECRETARY_PERMISSIONS)),
      'GET /members/m1': { body: member },
    });
    renderApp('/members/m1');

    expect(
      await screen.findByRole('heading', { name: 'Maria Lima' }),
    ).toBeInTheDocument();
    expect(screen.getByText('maria@igreja.org')).toBeInTheDocument();
    expect(screen.getByText('20/05/1990')).toBeInTheDocument();
    expect(screen.getByText('Ministério de louvor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Editar/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Excluir/ }),
    ).not.toBeInTheDocument();
  });

  it('shows not found for missing members', async () => {
    mockApi({
      ...sessionRoutes(makeUser(ADMIN_PERMISSIONS)),
      'GET /members/missing': { status: 404, body: { message: 'Not Found' } },
    });
    renderApp('/members/missing');

    expect(
      await screen.findByText('Membro não encontrado.'),
    ).toBeInTheDocument();
  });

  it('creates a member sending only filled fields', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(SECRETARY_PERMISSIONS)),
      'POST /members': (request) => ({
        status: 201,
        body: {
          ...member,
          id: 'm2',
          ...(request.body as object),
          email: null,
          phone: null,
          birthDate: null,
          notes: null,
        },
      }),
      'GET /members/m2': { body: { ...member, id: 'm2', name: 'João Alves' } },
    });
    renderApp('/members/new');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadastrar membro' }),
    );
    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Nome/), {
      target: { value: 'João Alves' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'invalido' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar membro' }));
    expect(
      await screen.findByText('Informe um e-mail válido.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar membro' }));

    expect(
      await screen.findByText('Membro cadastrado com sucesso.'),
    ).toBeInTheDocument();
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/members')?.body,
    ).toEqual({
      name: 'João Alves',
      status: 'ACTIVE',
    });
  });

  it('edits a member and clears optional fields with null', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(SECRETARY_PERMISSIONS)),
      'GET /members/m1': { body: member },
      'PATCH /members/m1': (request) => ({
        body: { ...member, ...(request.body as object) },
      }),
    });
    renderApp('/members/m1/edit');

    const name = await screen.findByLabelText(/^Nome/);
    await waitFor(() => expect(name).toHaveValue('Maria Lima'));
    fireEvent.change(name, { target: { value: 'Maria L. Lima' } });
    fireEvent.change(screen.getByLabelText('Telefone'), {
      target: { value: '' },
    });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Inativo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText('Membro atualizado com sucesso.'),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      name: 'Maria L. Lima',
      status: 'INACTIVE',
      email: 'maria@igreja.org',
      phone: null,
      birthDate: '1990-05-20',
      notes: 'Ministério de louvor',
    });
  });

  it('deletes a member after confirmation (ADMIN)', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(ADMIN_PERMISSIONS)),
      'GET /members/m1': { body: member },
      'DELETE /members/m1': { status: 204 },
      'GET /members': { body: { items: [], total: 0, page: 1, pageSize: 10 } },
    });
    renderApp('/members/m1');

    fireEvent.click(await screen.findByRole('button', { name: /Excluir/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar exclusão' }),
    );

    expect(
      await screen.findByText('Membro excluído com sucesso.'),
    ).toBeInTheDocument();
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/members/m1'),
    ).toBe(true);
  });

  it('blocks the edit route without MEMBER_UPDATE', async () => {
    mockApi(sessionRoutes(makeUser(['MEMBER_READ'])));
    renderApp('/members/m1/edit');

    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
  });
});
