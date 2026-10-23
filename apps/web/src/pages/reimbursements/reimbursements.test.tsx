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
  categoryId: 'category',
  category: { id: 'category', name: 'Material' },
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
  const memberFormRoutes = {
    'GET /reimbursements/profile': {
      body: { name: 'Ana Souza', iban: row.iban },
    },
    'GET /reimbursements/categories': {
      body: [{ id: 'category', name: 'Material' }],
    },
  };
  async function chooseCategory() {
    fireEvent.change(screen.getByLabelText(/Valor total/), {
      target: { value: '25,10' },
    });
    fireEvent.mouseDown(
      await screen.findByRole('combobox', { name: /Categoria da despesa/ }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Material' }));
  }
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
  it('redirects visitors to login without showing the form', async () => {
    const requests = mockApi(anonymousRoutes);
    renderApp('/pedir-reembolso');
    await screen.findByRole('button', { name: 'Entrar' });
    expect(
      screen.queryByLabelText('Quem recebe o reembolso?'),
    ).not.toBeInTheDocument();
    expect(
      requests.some((request) => request.path.startsWith('/reimbursements')),
    ).toBe(false);
  });
  it('preserves the document after a server error and permits retry', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
      'POST /reimbursements': {
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
    await chooseCategory();
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
  it('requires IBAN, category and a positive amount before saving', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
      'GET /reimbursements/profile': {
        body: { name: 'Ana Souza', iban: null },
      },
    });
    const view = renderApp('/pedir-reembolso');
    const iban = await screen.findByLabelText(/IBAN do beneficiário/);
    expect(iban).toBeRequired();
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['test'], 'recibo.pdf', { type: 'application/pdf' })],
      },
    });
    await screen.findByText('recibo.pdf');
    const save = screen.getByRole('button', { name: 'Guardar pedido' });
    expect(save).toBeDisabled();
    await chooseCategory();
    expect(save).toBeDisabled();
    fireEvent.change(iban, { target: { value: row.iban } });
    await waitFor(() => expect(save).toBeEnabled());
    const amount = screen.getByLabelText(/Valor total/);
    expect(amount).toBeRequired();
    for (const value of ['', '0', '-1', '1.234']) {
      fireEvent.change(amount, { target: { value } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(amount, { target: { value: '0,01' } });
    expect(save).toBeEnabled();
    fireEvent.change(iban, { target: { value: '' } });
    expect(save).toBeDisabled();
  });
  it('blocks submission when the account has no member profile', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
      'GET /reimbursements/profile': { body: null },
    });
    renderApp('/pedir-reembolso');
    await screen.findByText(
      'O cadastro de reembolsos é exclusivo para membros.',
    );
    expect(
      screen.getByRole('button', { name: 'Guardar pedido' }),
    ).toBeDisabled();
  });
  it('prefills the authenticated member IBAN and submits it', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
      'GET /reimbursements/profile': {
        body: { name: 'Ana Souza', iban: row.iban },
      },
      'POST /reimbursements': { body: { id: 'iban-receipt' } },
    });
    renderApp('/pedir-reembolso');
    await waitFor(() =>
      expect(screen.getByLabelText(/IBAN do beneficiário/)).toHaveValue(
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
    await chooseCategory();
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
    expect((submission[1]?.body as FormData).get('amount')).toBe('25.10');
    expect((submission[1]?.body as FormData).get('categoryId')).toBe(
      'category',
    );
    expect((submission[1]?.body as FormData).has('contact')).toBe(false);
  });
  it('locks the beneficiary to the authenticated member and excludes it from the submitted payload', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
      'POST /reimbursements': { body: { id: 'receipt-2' } },
    });
    const view = renderApp('/pedir-reembolso');
    expect(
      await screen.findByLabelText('Quem recebe o reembolso?'),
    ).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('Quem recebe o reembolso?')).toHaveAttribute(
      'readonly',
    );
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: {
        files: [new File(['test'], 'recibo.pdf', { type: 'application/pdf' })],
      },
    });
    await chooseCategory();
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
    expect((submission[1]?.body as FormData).has('beneficiaryName')).toBe(
      false,
    );
    expect(submission[1]?.headers).toHaveProperty(
      'Authorization',
      'Bearer access-1',
    );
  });
  it('shows a member only their own list and no payment actions', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      ...memberFormRoutes,
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
