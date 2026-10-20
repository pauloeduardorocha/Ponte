import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@church/shared';
import {
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../../test/utils';

const row = {
  id: 'request-1',
  submittedBy: 'user-1',
  deletedAt: null,
  beneficiaryName: 'Maria',
  iban: 'PT50000201231234567890154',
  purpose: 'Material para crianças',
  amount: '25.10',
  currency: 'EUR',
  status: 'PAID',
  paidAt: '2026-10-14',
  bankTransactionId: null,
  createdAt: '2026-10-13',
  attachments: [
    { id: 'file-1', filename: 'recibo.pdf', kind: 'DOCUMENT', size: 100 },
  ],
};
const page = { items: [row], total: 1, page: 1, pageSize: 20 };
vi.mock('../../components/PdfPreview', () => ({ PdfPreview: () => null }));
describe('Reimbursements', () => {
  beforeEach(resetTestState);
  it.each([
    {
      role: 'author',
      permissions: [],
      route: '/reimbursements',
      list: '/reimbursements/mine',
      submittedBy: 'user-1',
    },
    {
      role: 'treasurer',
      permissions: [
        'FINANCE_TRANSACTION_READ',
        'FINANCE_TRANSACTION_UPDATE',
      ] as const,
      route: '/finance?tab=reimbursements',
      list: '/reimbursements',
      submittedBy: null,
    },
  ])(
    'lets the $role confirm deletion and removes the request from the list',
    async ({ permissions, route, list, submittedBy }) => {
      let deleted = false;
      const requests = mockApi({
        ...sessionRoutes(makeUser([...permissions])),
        [`GET ${list}`]: () => ({
          body: {
            ...page,
            items: deleted ? [] : [{ ...row, submittedBy }],
            total: deleted ? 0 : 1,
          },
        }),
        'DELETE /reimbursements/request-1': () => {
          deleted = true;
          return { body: { id: row.id } };
        },
      });
      renderApp(route);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Excluir pedido' }),
      );
      expect(
        screen.getByRole('dialog', { name: 'Excluir pedido de reembolso?' }),
      ).toHaveTextContent(
        'documentos associados a movimentos bancários serão preservados',
      );
      expect(requests.some((request) => request.method === 'DELETE')).toBe(
        false,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirmar exclusão' }),
      );
      expect(
        await screen.findByText('Nenhum pedido encontrado.'),
      ).toBeInTheDocument();
      expect(
        requests.some(
          (request) =>
            request.path === '/reimbursements/request-1' &&
            request.method === 'DELETE',
        ),
      ).toBe(true);
    },
  );
  it('submits dropped documents without login and displays a receipt', async () => {
    mockApi({
      ...anonymousRoutes,
      'POST /reimbursements/public': { body: { id: 'receipt-1' } },
    });
    renderApp('/pedir-reembolso');
    await screen.findByLabelText('Quem recebe o reembolso?');
    expect(
      screen.getByRole('button', { name: 'Guardar pedido' }),
    ).toBeDisabled();
    fireEvent.drop(
      screen.getByRole('button', { name: 'Carregar documentos' }),
      {
        dataTransfer: {
          files: [
            new File(['%PDF-test'], 'recibo.pdf', { type: 'application/pdf' }),
          ],
        },
      },
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar pedido' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }));
    expect(
      await screen.findByText(/Referência: receipt-1/),
    ).toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls;
    const submission = calls.find(([path]) =>
      String(path).endsWith('/reimbursements/public'),
    )!;
    const body = submission[1]?.body as FormData;
    expect(body.getAll('files')).toHaveLength(1);
    expect(submission[1]?.headers).not.toHaveProperty('Authorization');
  });
  it('preserves the document after a server error and permits retry', async () => {
    mockApi({
      ...anonymousRoutes,
      'POST /reimbursements/public': {
        status: 400,
        body: { message: 'Formato inválido' },
      },
    });
    const view = renderApp('/pedir-reembolso');
    await screen.findByLabelText('Quem recebe o reembolso?');
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['test'], 'recibo.pdf', { type: 'application/pdf' })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar pedido' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }));
    expect(await screen.findByText('Formato inválido')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Guardar pedido' }),
    ).toBeEnabled();
    expect(screen.getByText('recibo.pdf')).toBeInTheDocument();
  });
  it('prefills the authenticated member IBAN and submits it', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'GET /reimbursements/profile': {
        body: { name: 'Ana Souza', iban: row.iban },
      },
      'POST /reimbursements': { body: { id: 'iban-receipt' } },
    });
    renderApp('/pedir-reembolso');
    await waitFor(() =>
      expect(screen.getByLabelText('IBAN do beneficiário')).toHaveValue(
        row.iban,
      ),
    );
    fireEvent.drop(
      screen.getByRole('button', { name: 'Carregar documentos' }),
      {
        dataTransfer: {
          files: [
            new File(['%PDF-test'], 'recibo.pdf', { type: 'application/pdf' }),
          ],
        },
      },
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar pedido' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }));
    await screen.findByText(/Referência: iban-receipt/);
    const submission = vi
      .mocked(fetch)
      .mock.calls.find(([path]) => String(path).endsWith('/reimbursements'))!;
    expect((submission[1]?.body as FormData).get('iban')).toBe(row.iban);
    expect((submission[1]?.body as FormData).has('contact')).toBe(false);
  });
  it('allows an authenticated member to submit for another person', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'POST /reimbursements': { body: { id: 'receipt-2' } },
    });
    const view = renderApp('/pedir-reembolso');
    expect(
      await screen.findByLabelText('Quem recebe o reembolso?'),
    ).toHaveValue('Ana Souza');
    fireEvent.change(screen.getByLabelText('Quem recebe o reembolso?'), {
      target: { value: 'Maria' },
    });
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['test'], 'recibo.pdf', { type: 'application/pdf' })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Guardar pedido' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar pedido' }));
    await screen.findByText(/Referência: receipt-2/);
    const submission = vi
      .mocked(fetch)
      .mock.calls.find(([path]) => String(path).endsWith('/reimbursements'))!;
    expect((submission[1]?.body as FormData).get('beneficiaryName')).toBe(
      'Maria',
    );
    expect(submission[1]?.headers).toHaveProperty(
      'Authorization',
      'Bearer access-1',
    );
  });
  it('shows a member only their own list and no payment actions', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'GET /reimbursements/mine': { body: page },
      'GET /reimbursements/request-1': { body: row },
    });
    renderApp('/reimbursements');
    await screen.findByText('Material para crianças');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir pedido' }));
    await screen.findByRole('dialog', { name: /Pedido de reembolso/ });
    expect(
      screen.queryByText('Corrigir registo de pagamento'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Anexar comprovativo de transferência bancária'),
    ).not.toBeInTheDocument();
    expect(requests.some((request) => request.path === '/reimbursements')).toBe(
      false,
    );
  });
  it('lets the treasurer confirm a bank match without creating another expense', async () => {
    const requests = mockApi({
      ...sessionRoutes(
        makeUser(PERMISSIONS.filter((p) => p.startsWith('FINANCE_'))),
      ),
      'GET /finance/banking/pending-classification': { body: { total: 0 } },
      'GET /finance/expenses': { body: { items: [], total: 0 } },
      'GET /reimbursements': { body: page },
      'GET /reimbursements/request-1': { body: row },
      'GET /reimbursements/request-1/suggestions': {
        body: [
          {
            id: 'bank-1',
            date: '2026-10-14',
            amount: '25.10',
            description: 'transferência bancária Maria',
          },
        ],
      },
      'POST /reimbursements/request-1/link': { body: { id: row.id } },
    });
    renderApp('/finance?tab=reimbursements&request=request-1');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar associação' }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.path === '/reimbursements/request-1/link' &&
            request.method === 'POST' &&
            (request.body as { transactionId: string }).transactionId ===
              'bank-1',
        ),
      ).toBe(true),
    );
    expect(
      requests.some(
        (request) =>
          request.path === '/finance/expenses' && request.method === 'POST',
      ),
    ).toBe(false);
  });
});
