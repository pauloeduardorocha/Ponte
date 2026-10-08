import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../../test/utils';
describe('Operational workflows', () => {
  beforeEach(resetTestState);
  it('opens the personal inbox without management permission or a client-selected recipient', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': {
        body: {
          items: [
            {
              id: 'n1',
              subject: 'Bem-vinda',
              content: 'Mensagem pessoal',
              sentAt: '2026-10-07T10:00:00Z',
            },
          ],
          total: 1,
        },
      },
    });
    renderApp('/inbox');
    expect(await screen.findByText('Mensagem pessoal')).toBeInTheDocument();
    expect(
      requests
        .find((r) => r.path === '/operations/inbox')
        ?.query.get('memberId'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cadastrar' }),
    ).not.toBeInTheDocument();
  });
  it('keeps the operational dashboard separate from financial panels even when both are authorized', async () => {
    const requests = mockApi({
      ...sessionRoutes(
        makeUser([
          'FOLLOWUP_READ',
          'FINANCE_DASHBOARD_READ',
          'FINANCE_CONTRIBUTION_READ',
        ]),
      ),
      'GET /operations/dashboard': { body: { pendingFollowUps: 1 } },
    });
    renderApp('/operations');
    expect(
      await screen.findByRole('link', {
        name: 'Aguardando contato: 1. Abrir lista',
      }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
    expect(screen.queryByText('Dízimos')).not.toBeInTheDocument();
  });
  it('does not fetch pastoral data or render menus for an unauthorized member', async () => {
    const requests = mockApi(sessionRoutes(makeUser([])));
    renderApp('/follow-ups');
    expect(
      await screen.findByText(
        'Você não tem permissão para acessar este módulo.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/operations'))).toBe(false);
    expect(
      screen.queryByRole('link', { name: 'Acompanhamento' }),
    ).not.toBeInTheDocument();
  });
  it('loads paginated groups, filters days and shows participant history without financial data', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['SMALL_GROUP_READ', 'SMALL_GROUP_MANAGE'])),
      'GET /operations/small-groups': {
        body: {
          items: [
            {
              id: 'g1',
              name: 'Grupo familiar Esperança',
              leader: { id: 'p1', name: 'Ana' },
              meetingDay: 2,
              meetingTime: '20:00',
              active: true,
            },
          ],
          total: 1,
        },
      },
      'GET /operations/small-groups/g1/participants': {
        body: {
          items: [
            {
              id: 'join1',
              member: { id: 'p1', name: 'Ana' },
              active: false,
              role: 'MEMBER',
              joinedAt: '2026-09-01',
              leftAt: '2026-10-01',
            },
          ],
          total: 1,
        },
      },
    });
    renderApp('/small-groups');
    expect(await screen.findByText('Grupo familiar Esperança')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Financeiro' }),
    ).not.toBeInTheDocument();
    expect(
      requests
        .find((r) => r.path === '/operations/small-groups')
        ?.query.get('pageSize'),
    ).toBe('25');
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText(/Saída:/)).toBeInTheDocument();
    expect(
      dialog.queryByRole('button', { name: 'Registrar saída' }),
    ).not.toBeInTheDocument();
  });
  it('requires confirmation before recording departure and preserves the displayed history', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MINISTRY_READ', 'MINISTRY_MANAGE'])),
      'GET /operations/ministries': {
        body: {
          items: [{ id: 'm1', name: 'Recepção', active: true }],
          total: 1,
        },
      },
      'GET /operations/ministries/m1/participants': {
        body: {
          items: [
            {
              id: 'j1',
              member: { id: 'p1', name: 'Ana' },
              active: true,
              role: 'MEMBER',
            },
          ],
          total: 1,
        },
      },
      'POST /operations/ministries/m1/participants/j1/leave': {
        status: 201,
        body: { id: 'j1', active: false },
      },
    });
    renderApp('/ministries');
    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar saída' }),
    );
    expect(
      requests.some((r) => r.method === 'POST' && r.path.endsWith('/leave')),
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === 'POST' && r.path.endsWith('/leave')),
      ).toBe(true),
    );
    expect(await screen.findByText('Operação concluída.')).toBeInTheDocument();
  });
  it('shows conflict feedback from the server when assigning a volunteer', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['SCHEDULE_READ', 'SCHEDULE_MANAGE'])),
      'GET /operations/schedules': {
        body: {
          items: [{ id: 's1', title: 'Recepção', status: 'DRAFT' }],
          total: 1,
        },
      },
      'GET /operations/schedules/s1/assignments': {
        body: { items: [], total: 0 },
      },
      'GET /operations/identity': { body: { memberId: 'p1' } },
      'GET /operations/people': {
        body: { items: [{ id: 'p1', name: 'Ana' }], total: 1 },
      },
      'POST /operations/schedules/s1/assignments': {
        status: 409,
        body: { message: 'Conflito de horário: escolha outro voluntário.' },
      },
    });
    renderApp('/schedules');
    fireEvent.click(await screen.findByRole('button', { name: 'Detalhes' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Convidar voluntário' }),
    );
    const dialogs = screen.getAllByRole('dialog'),
      form = within(dialogs[dialogs.length - 1]!);
    fireEvent.mouseDown(form.getByRole('combobox', { name: /Membro/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ana' }));
    fireEvent.change(form.getByRole('textbox', { name: /Função/ }), {
      target: { value: 'Recepção' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Conflito de horário: escolha outro voluntário.'),
    ).toBeInTheDocument();
    expect(
      requests.find(
        (r) => r.method === 'POST' && r.path.endsWith('/assignments'),
      )?.body,
    ).toMatchObject({ memberId: 'p1', function: 'Recepção' });
  });
  it('renders only permission-scoped operational dashboard indicators and links', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FOLLOWUP_READ', 'SMALL_GROUP_READ'])),
      'GET /operations/dashboard': {
        body: {
          pendingFollowUps: 2,
          overdueContacts: 1,
          activeGroups: 3,
          nextContacts: [],
        },
      },
    });
    renderApp('/');
    expect(
      await screen.findByRole('link', {
        name: 'Contatos atrasados: 1. Abrir lista',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Receitas')).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
  });
});
