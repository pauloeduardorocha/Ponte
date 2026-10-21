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

function show(fields: Field[], initial?: Entry) {
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
        path="/operations/visitors/v1"
        method="PATCH"
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

  it.each(
    Object.entries(configs).flatMap(([resource, config]) =>
      config.fields
        .filter((field) => field.options)
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
