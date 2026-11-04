import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetTestState } from '../test/utils';
import { MemberFamily } from './MemberFamily';

function setup() {
  const requests = mockApi({
    'GET /member-family/me': { body: [] },
    'POST /member-family/me': { body: [] },
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemberFamily />
    </QueryClientProvider>,
  );
  return requests;
}

describe('Member family', () => {
  beforeEach(resetTestState);
  it('registers a relative without requiring contacts or creating access', async () => {
    const requests = setup();
    await screen.findByText('Nenhum vínculo familiar cadastrado.');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar familiar' }));
    fireEvent.change(screen.getByLabelText(/Nome do familiar/), {
      target: { value: 'Familiar Teste' },
    });
    fireEvent.change(screen.getByLabelText(/Data de nascimento do familiar/), {
      target: { value: '1990-01-02' },
    });
    expect(screen.getByLabelText(/E-mail do familiar/)).not.toBeRequired();
    expect(screen.getByLabelText(/Telefone do familiar/)).not.toBeRequired();
    expect(
      screen.queryByLabelText(/Senha do familiar/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        relation: 'SPOUSE',
        name: 'Familiar Teste',
        birthDate: '1990-01-02',
        createAccount: false,
      }),
    );
    expect(
      await screen.findByText('Vínculo familiar salvo.'),
    ).toBeInTheDocument();
  });
  it('requires contacts and password when access is checked and announces approval', async () => {
    const requests = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Adicionar familiar' }),
    );
    fireEvent.change(screen.getByLabelText(/Nome do familiar/), {
      target: { value: 'Familiar' },
    });
    fireEvent.change(screen.getByLabelText(/Data de nascimento do familiar/), {
      target: { value: '1990-01-02' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Criar acesso ao sistema para o familiar',
      }),
    );
    expect(screen.getByLabelText(/E-mail do familiar/)).toBeRequired();
    expect(screen.getByLabelText(/Telefone do familiar/)).toBeRequired();
    expect(screen.getByLabelText(/Senha do familiar/)).toBeRequired();
    fireEvent.change(screen.getByLabelText(/E-mail do familiar/), {
      target: { value: 'family@example.org' },
    });
    fireEvent.change(screen.getByLabelText(/Telefone do familiar/), {
      target: { value: '+351912345678' },
    });
    fireEvent.change(screen.getByLabelText(/Senha do familiar/), {
      target: { value: 'long-test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
    expect(
      await screen.findByText(
        'Familiar cadastrado. O acesso está aguardando aprovação.',
      ),
    ).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      createAccount: true,
      email: 'family@example.org',
      phone: '+351912345678',
      password: 'long-test-password',
    });
  });
  it('removes reciprocal links only after confirmation and supports read-only views', async () => {
    const requests = mockApi({
      'GET /member-family/me': {
        body: [
          {
            id: 'link-1',
            relation: 'MOTHER',
            parentRole: 'CHILD',
            member: {
              id: 'm1',
              name: 'Familiar',
              birthDate: '1960-01-01',
              user: null,
            },
          },
        ],
      },
      'DELETE /member-family/me/link-1': { status: 204 },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <MemberFamily canEdit={false} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Familiar · Mãe')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adicionar familiar' }),
    ).not.toBeInTheDocument();
    view.rerender(
      <QueryClientProvider client={client}>
        <MemberFamily />
      </QueryClientProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remover vínculo com Familiar' }),
    );
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() =>
      expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1),
    );
  });
  it('links an existing member without sending new account credentials', async () => {
    const requests = mockApi({
      'GET /member-family/me': { body: [] },
      'GET /member-family/me/search': {
        body: [{ id: 'existing', name: 'Membro Existente' }],
      },
      'POST /member-family/me': { body: { success: true } },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemberFamily />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Adicionar familiar' }),
    );
    fireEvent.mouseDown(
      screen.getByRole('combobox', { name: 'Cadastro do familiar' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Membro existente' }));
    fireEvent.change(screen.getByLabelText('Buscar membro pelo nome'), {
      target: { value: 'Membro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar membro' }));
    fireEvent.mouseDown(
      await screen.findByRole('combobox', { name: /Membro existente/ }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Membro Existente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        relation: 'SPOUSE',
        memberId: 'existing',
      }),
    );
    expect(
      requests.find((r) => r.path.endsWith('/search'))?.query.get('search'),
    ).toBe('Membro');
  });
});
