import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationForm } from './OperationForm';
import {
  configs,
  dayLabels,
  operationLabels,
  type Entry,
  type Field,
} from './operation-config';
import { mockApi, resetTestState } from '../../test/utils';

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

function show(fields: Field[], initial?: Entry, notification = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <OperationForm
        title="Editar registro"
        path={
          notification ? '/operations/notifications' : '/operations/visitors/v1'
        }
        method={notification ? 'POST' : 'PATCH'}
        fields={fields}
        initial={initial}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function select(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getAllByRole('option', { name: option })[0]!);
}

describe('Operation form selections', () => {
  beforeEach(resetTestState);

  it.each([
    ['Grupos familiares', 'small-groups', 'smallGroupIds'],
    ['Ministérios', 'ministries', 'ministryIds'],
    ['Roles', 'roles', 'roleIds'],
  ])(
    'sends to multiple %s and clears hidden recipients when changing audience',
    async (label, kind, key) => {
      const requests = mockApi({
        'GET /operations/people': {
          body: { items: [{ id: 'm1', name: 'Membro individual' }] },
        },
        [`GET /operations/notification-audiences/${kind}`]: {
          body: {
            items: [
              { id: 'a1', name: 'Opção A' },
              { id: 'a2', name: 'Opção B' },
            ],
          },
        },
        'POST /operations/notifications': {
          body: { total: 2, sent: 2, failed: 0, pending: 0, status: 'SENT' },
        },
      });
      show(configs.notifications.fields, undefined, true);
      fireEvent.mouseDown(
        screen.getByRole('combobox', { name: 'Destinatários: membros' }),
      );
      fireEvent.click(
        await screen.findByRole('option', { name: 'Membro individual' }),
      );
      select('Enviar para', label);
      expect(
        screen.queryByRole('combobox', { name: 'Destinatários: membros' }),
      ).not.toBeInTheDocument();
      fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
      fireEvent.click(await screen.findByRole('option', { name: 'Opção A' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Opção B' }));
      expect(screen.getByRole('combobox', { name: label })).not.toBeRequired();
      expect(screen.getByRole('option', { name: 'Opção A' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('option', { name: 'Opção B' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      fireEvent.keyDown(screen.getByRole('combobox', { name: label }), {
        key: 'Escape',
      });
      fireEvent.change(screen.getByLabelText(/Mensagem/), {
        target: { value: 'Comunicado coletivo' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() =>
        expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
          [key]: ['a1', 'a2'],
          channel: 'INTERNAL',
          content: 'Comunicado coletivo',
        }),
      );
    },
  );

  it.each([
    ['MEMBER', 'Destinatários: membros', 'people', 'recipientMemberIds'],
    ['VISITOR', 'Destinatários: visitantes', 'visitors', 'recipientVisitorIds'],
  ])(
    'submits the multiselect for %s and allows removing a selected recipient',
    async (audience, label, lookup, key) => {
      const requests = mockApi({
        'GET /operations/people': { body: { items: [] } },
        [`GET /operations/${lookup}`]: {
          body: {
            items: [
              { id: 'p1', name: 'Pessoa A' },
              { id: 'p2', name: 'Pessoa B' },
              { id: 'p3', name: 'Pessoa C' },
            ],
          },
        },
        'POST /operations/notifications': {
          body: { total: 2, sent: 2, failed: 0, pending: 0, status: 'SENT' },
        },
      });
      show(configs.notifications.fields, undefined, true);
      if (audience === 'VISITOR') select('Enviar para', 'Visitantes');
      const input = screen.getByRole('combobox', { name: label });
      fireEvent.mouseDown(input);
      fireEvent.click(await screen.findByRole('option', { name: 'Pessoa A' }));
      fireEvent.click(screen.getByRole('option', { name: 'Pessoa B' }));
      fireEvent.click(screen.getByRole('option', { name: 'Pessoa C' }));
      fireEvent.click(screen.getByRole('option', { name: 'Pessoa B' }));
      expect(screen.getByRole('option', { name: 'Pessoa B' })).toHaveAttribute(
        'aria-selected',
        'false',
      );
      expect(screen.getByRole('option', { name: 'Pessoa A' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.change(screen.getByLabelText(/Mensagem/), {
        target: { value: 'Aviso' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() =>
        expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
          [key]: ['p1', 'p3'],
          channel: 'INTERNAL',
          content: 'Aviso',
        }),
      );
    },
  );

  it('sends to all members after switching away from a required audience lookup', async () => {
    const requests = mockApi({
      'GET /operations/people': { body: { items: [] } },
      'GET /operations/notification-audiences/small-groups': {
        body: { items: [] },
      },
      'POST /operations/notifications': { body: { total: 2, status: 'SENT' } },
    });
    show(configs.notifications.fields, undefined, true);
    select('Enviar para', 'Grupos familiares');
    select('Enviar para', 'Todos os membros');
    fireEvent.change(screen.getByLabelText(/Mensagem/), {
      target: { value: 'Aviso geral' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        allMembers: true,
        channel: 'INTERNAL',
        content: 'Aviso geral',
      }),
    );
  });

  it('uses a native date and time picker and submits the selected local time in UTC', async () => {
    const requests = mockApi({
      'POST /operations/notifications': {
        body: { id: 'n1', status: 'PENDING' },
      },
    });
    show(
      configs.notifications.fields.filter((f) =>
        ['content', 'scheduledAt'].includes(f.key),
      ),
      undefined,
      true,
    );
    const picker = screen.getByLabelText('Agendamento');
    expect(picker).toHaveAttribute('type', 'datetime-local');
    fireEvent.change(picker, { target: { value: '2026-12-25T18:30' } });
    fireEvent.change(screen.getByLabelText(/Mensagem/), {
      target: { value: 'Aviso agendado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        content: 'Aviso agendado',
        scheduledAt: new Date('2026-12-25T18:30').toISOString(),
      }),
    );
  });

  it('leaves scheduling optional and creates an immediate notification in one request', async () => {
    const requests = mockApi({
      'POST /operations/notifications': { body: { id: 'n1', status: 'SENT' } },
    });
    show(
      configs.notifications.fields.filter((f) =>
        ['content', 'scheduledAt'].includes(f.key),
      ),
      undefined,
      true,
    );
    expect(
      screen.getByText(
        /Sem agendamento, a notificação será enviada imediatamente/,
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Mensagem/), {
      target: { value: 'Enviar agora' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        content: 'Enviar agora',
      }),
    );
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it.each(
    Object.entries(configs).flatMap(([resource, config]) =>
      config.fields
        .filter((field) => field.options && field.key !== 'audience')
        .map((field) => ({
          resource,
          field,
          value: field.options![1]!,
        })),
    ),
  )('restores and submits $resource.$field.key', async ({ field, value }) => {
    const requests = mockApi({
      'PATCH /operations/visitors/v1': { body: { id: 'v1' } },
    });
    show([field], { id: 'v1', [field.key]: value });
    const label =
      field.key === 'meetingDay'
        ? dayLabels[Number(value)]!
        : (field.optionLabels?.[value] ?? operationLabels[value] ?? value);
    expect(
      screen.getByRole('combobox', { name: new RegExp(field.label) }),
    ).toHaveTextContent(label);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        [field.key]: field.key === 'meetingDay' ? Number(value) : value,
      }),
    );
  });

  it.each([
    ['visitors', 'invitedByMemberId', 'invitedBy'],
    ['small-groups', 'leaderMemberId', 'leader'],
    ['small-groups', 'coLeaderMemberId', 'coLeader'],
    ['small-groups', 'hostMemberId', 'host'],
    ['follow-ups', 'assignedToUserId', 'assignedTo'],
  ] as const)(
    'shows the saved name for %s.%s outside the current results',
    async (resource, key, relation) => {
      const field = configs[resource].fields.find((f) => f.key === key)!;
      const requests = mockApi({
        [`GET /operations/${field.lookup}`]: {
          body: { items: [{ id: 'other', name: 'Outra pessoa' }] },
        },
        'PATCH /operations/visitors/v1': { body: { id: 'v1' } },
      });
      show([field], {
        id: 'v1',
        [key]: 'saved-person',
        [relation]: { id: 'saved-person', name: 'Pessoa salva' },
      });
      const input = screen.getByRole('combobox', {
        name: new RegExp(field.label),
      });
      expect(input).toHaveValue('Pessoa salva');
      await waitFor(() =>
        expect(requests.some((r) => r.method === 'GET')).toBe(true),
      );
      expect(input).toHaveValue('Pessoa salva');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() =>
        expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
          [key]: 'saved-person',
        }),
      );
    },
  );

  it('displays saved visitor selections and submits them unchanged', async () => {
    const requests = mockApi({
      'GET /operations/people': { body: { items: [] } },
      'PATCH /operations/visitors/v1': { body: { id: 'v1' } },
    });
    show(configs.visitors.fields, {
      id: 'v1',
      firstName: 'Ana',
      firstVisitDate: '2026-10-21',
      gender: 'FEMALE',
      status: 'CONTACTED',
    });
    expect(screen.getByRole('combobox', { name: 'Gênero' })).toHaveTextContent(
      'Feminino',
    );
    expect(
      screen.getByRole('combobox', { name: 'Situação' }),
    ).toHaveTextContent('Contatado');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toMatchObject({
        gender: 'FEMALE',
        status: 'CONTACTED',
      }),
    );
  });

  it('submits changed selections, restores them on reopening, and clears optional gender', async () => {
    const requests = mockApi({
      'PATCH /operations/visitors/v1': { body: { id: 'v1' } },
    });
    const fields = configs.visitors.fields.filter((f) =>
      ['gender', 'status'].includes(f.key),
    );
    const view = show(fields, {
      id: 'v1',
      gender: 'FEMALE',
      status: 'CONTACTED',
    });
    select('Gênero', 'Masculino');
    select('Situação', 'Em integração');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        gender: 'MALE',
        status: 'INTEGRATING',
      }),
    );
    view.unmount();
    show(fields, {
      ...(requests.find((r) => r.method === 'PATCH')!.body as Entry),
      id: 'v1',
    });
    expect(screen.getByRole('combobox', { name: 'Gênero' })).toHaveTextContent(
      'Masculino',
    );
    expect(
      screen.getByRole('combobox', { name: 'Situação' }),
    ).toHaveTextContent('Em integração');
    select('Gênero', 'Não informado');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.filter((r) => r.method === 'PATCH')[1]?.body).toEqual({
        gender: null,
        status: 'INTEGRATING',
      }),
    );
  });

  it('displays and preserves Sunday when editing a group with meeting day zero', async () => {
    const requests = mockApi({
      'PATCH /operations/visitors/v1': { body: { id: 'g1' } },
    });
    show(
      configs['small-groups'].fields.filter((f) => f.key === 'meetingDay'),
      {
        id: 'g1',
        meetingDay: 0,
      },
    );
    expect(
      screen.getByRole('combobox', { name: 'Dia da semana' }),
    ).toHaveTextContent('Domingo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        meetingDay: 0,
      }),
    );
  });
});
