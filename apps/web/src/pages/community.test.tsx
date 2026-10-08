import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Community registration and permissions', () => {
  beforeEach(resetTestState);
  it('protects visitors and events without querying unauthorized data', async () => {
    const requests = mockApi(sessionRoutes(makeUser([])));
    renderApp('/visitors');
    expect(
      await screen.findByText(
        'Você não tem permissão para acessar este módulo.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/community'))).toBe(false);
  });
  it('registers a visitor, displays operation feedback and uses server pagination', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['VISITOR_READ', 'VISITOR_CREATE'])),
      'GET /operations/visitors': { body: { items: [], total: 0 } },
      'POST /operations/visitors': { status: 201, body: { id: 'visitor-1' } },
    });
    renderApp('/visitors');
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Visitante' },
    });
    fireEvent.change(dialog.getByRole('textbox', { name: /Sobrenome/ }), {
      target: { value: 'de teste' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(
        requests.find(
          (r) => r.method === 'POST' && r.path === '/operations/visitors',
        )?.body,
      ).toMatchObject({
        firstName: 'Visitante',
        lastName: 'de teste',
        status: 'NEW',
      }),
    );
    expect(
      await screen.findByText('Cadastro salvo com sucesso.'),
    ).toBeInTheDocument();
    expect(
      requests
        .find((r) => r.path === '/operations/visitors')
        ?.query.get('pageSize'),
    ).toBe('25');
  });
});
