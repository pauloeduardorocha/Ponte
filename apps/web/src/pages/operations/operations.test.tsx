import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../../test/utils';
describe('Operational workflows', () => {
  beforeEach(resetTestState);
  it('hides global audiences for senders without global operation scope', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['NOTIFICATION_READ', 'NOTIFICATION_SEND'])),
      'GET /operations/notifications': { body: { items: [], total: 0 } },
      'GET /operations/people': { body: { items: [] } },
    });
    renderApp('/notifications');
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Enviar para' }));
    expect(
      screen.getByRole('option', { name: 'Grupos familiares' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Ministérios' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Roles' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Todos os membros' }),
    ).not.toBeInTheDocument();
  });
  it.each([
    ['SENT', 'Notificação enviada.', 'success'],
    [
      'FAILED',
      'Não foi possível enviar a notificação. Consulte a situação do envio.',
      'error',
    ],
  ])(
    'reports the immediate notification outcome %s after creation',
    async (status, notice, severity) => {
      const requests = mockApi({
        ...sessionRoutes(makeUser(['NOTIFICATION_READ', 'NOTIFICATION_SEND'])),
        'GET /operations/notifications': { body: { items: [], total: 0 } },
        'GET /operations/people': {
          body: { items: [{ id: 'member', name: 'Destinatária' }] },
        },
        'GET /operations/visitors': { body: { items: [] } },
        'POST /operations/notifications': { body: { id: 'n1', status } },
      });
      renderApp('/notifications');
      fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar' }));
      const recipient = await screen.findByRole('combobox', {
        name: 'Destinatários: membros',
      });
      fireEvent.mouseDown(recipient);
      fireEvent.click(
        await screen.findByRole('option', { name: 'Destinatária' }),
      );
      fireEvent.change(screen.getByLabelText(/Mensagem/), {
        target: { value: 'Comunicado' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        (await screen.findByText(notice)).closest('[role="alert"]'),
      ).toHaveClass(
        `MuiAlert-standard${severity[0]!.toUpperCase()}${severity.slice(1)}`,
      );
      expect(
        requests.filter(
          (r) =>
            r.method === 'POST' &&
            r.path.startsWith('/operations/notifications'),
        ),
      ).toEqual([
        expect.objectContaining({
          path: '/operations/notifications',
          body: {
            recipientMemberIds: ['member'],
            channel: 'INTERNAL',
            content: 'Comunicado',
          },
        }),
      ]);
    },
  );
  it('shows the five meaningful indicators and defaults and resets to 30 calendar days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    try {
      const requests = mockApi({
        ...sessionRoutes(
          makeUser([
            'MEMBER_READ',
            'VISITOR_READ',
            'FOLLOWUP_READ',
            'SMALL_GROUP_READ',
            'MINISTRY_READ',
          ]),
        ),
        'GET /operations/dashboard': {
          body: {
            activeMembers: 329,
            activeMembersWithoutGroup: 100,
            followedVisitors: 0,
            visitors: 2,
            activeVolunteers: 11,
            integrating: 3,
            pendingFollowUps: 5,
            activeGroups: 4,
          },
        },
      });
      renderApp('/operations');
      expect(
        await screen.findByRole('link', {
          name: 'Voluntários/membros: 11/329. Abrir lista',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('11 voluntários de 329 membros ativos'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', {
          name: 'Visitantes acompanhados/visitantes no período: 0/2. Abrir lista',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Membros ativos sem grupo familiar'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Aguardando contato')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Grupos familiares ativas'),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Período: de')).toHaveValue('21/09/2026');
      expect(screen.getByLabelText('Período: até')).toHaveValue('20/10/2026');
      const first = requests.find((r) => r.path === '/operations/dashboard')!;
      expect(first.query.get('start')).toBe('2026-09-21');
      expect(first.query.get('end')).toBe('2026-10-20');
      fireEvent.change(screen.getByLabelText('Período: de'), {
        target: { value: '01/09/2026' },
      });
      await waitFor(() =>
        expect(
          requests.some((r) => r.query.get('start') === '2026-09-01'),
        ).toBe(true),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Últimos 30 dias' }));
      expect(screen.getByLabelText('Período: de')).toHaveValue('21/09/2026');
    } finally {
      vi.useRealTimers();
    }
  });
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
      'GET /operations/dashboard': { body: { integrating: 1 } },
    });
    renderApp('/operations');
    expect(
      await screen.findByRole('link', {
        name: 'Pessoas em integração: 1. Abrir lista',
      }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
    expect(screen.queryByText('Dízimos')).not.toBeInTheDocument();
  });
  it('does not fetch pastoral data or render menus for an unauthorized member', async () => {
    const requests = mockApi(sessionRoutes(makeUser([])));
    renderApp('/follow-ups');
    expect(
      await screen.findByText('Você não tem permissão para acessar esta área.'),
    ).toBeInTheDocument();
    expect(
      requests.filter(
        (r) =>
          r.path.startsWith('/operations') &&
          !['/operations/inbox/unread', '/operations/push/config'].includes(
            r.path,
          ),
      ),
    ).toEqual([]);
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
    expect(
      await screen.findByText('Grupo familiar Esperança'),
    ).toBeInTheDocument();
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
  it.each([false, true])(
    'uses ministry leadership capability for schedule creation (%s)',
    async (canCreate) => {
      mockApi({
        ...sessionRoutes(makeUser(['COMMUNITY_READ'])),
        'GET /operations/schedules': {
          body: { items: [], total: 0, canCreate },
        },
        'GET /operations/ministries': {
          body: {
            items: [
              { id: 'led', name: 'Ministério liderado', canManage: true },
              {
                id: 'member',
                name: 'Ministério sem liderança',
                canManage: false,
              },
            ],
            total: 2,
          },
        },
      });
      renderApp('/schedules');
      await screen.findByText(/Nenhum registro encontrado/);
      expect(!!screen.queryByRole('button', { name: 'Cadastrar' })).toBe(
        canCreate,
      );
      if (canCreate) {
        fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.mouseDown(
          within(dialog).getByRole('combobox', { name: /Ministério/ }),
        );
        expect(
          await screen.findByRole('option', { name: 'Ministério liderado' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('option', { name: 'Ministério sem liderança' }),
        ).not.toBeInTheDocument();
      }
    },
  );
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
          integrating: 1,
          activeGroups: 3,
          nextContacts: [],
        },
      },
    });
    renderApp('/');
    expect(
      await screen.findByRole('link', {
        name: 'Pessoas em integração: 1. Abrir lista',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Receitas')).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
  });
});
