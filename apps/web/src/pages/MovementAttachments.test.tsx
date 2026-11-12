import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MovementAttachments } from './MovementAttachments';
import { mockApi, resetTestState } from '../test/utils';

const path = '/finance/banking/transactions/movement/attachments';
const attachment = { id: 'attachment', filename: 'receipt.pdf', size: 8 };
vi.mock('./reimbursements/ReimbursementDocuments', () => ({
  MovementReimbursement: () => null,
}));
vi.mock('../components/PdfPreview', () => ({ PdfPreview: () => null }));
function renderAttachments() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MovementAttachments transactionId="movement" />
    </QueryClientProvider>,
  );
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe('Movement attachments interactions', () => {
  beforeEach(resetTestState);
  it('keeps the extension and shows loading until rename completes', async () => {
    const pending = deferred();
    const requests = mockApi({
      [`GET ${path}`]: { body: [attachment] },
      [`PATCH ${path}/attachment`]: async () => {
        await pending.promise;
        return { body: { ...attachment, filename: 'Comprovante.pdf' } };
      },
    });
    renderAttachments();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Renomear receipt.pdf' }),
    );
    fireEvent.change(screen.getByLabelText('Nome do ficheiro'), {
      target: { value: 'Comprovante' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByLabelText('Renomeando anexo'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A guardar/ })).toBeDisabled();
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        filename: 'Comprovante.pdf',
      }),
    );
    await act(async () => pending.resolve());
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
  it('confirms deletion and shows loading until the updated list arrives', async () => {
    const pending = deferred();
    let deleted = false;
    mockApi({
      [`GET ${path}`]: () => ({ body: deleted ? [] : [attachment] }),
      [`DELETE ${path}/attachment`]: async () => {
        await pending.promise;
        deleted = true;
        return { body: { id: attachment.id } };
      },
    });
    renderAttachments();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar receipt.pdf' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Eliminar anexo?');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar anexo' }));
    expect(
      await screen.findByLabelText('A eliminar anexo'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await act(async () => pending.resolve());
    await screen.findByText('Anexos (0/5)');
    expect(
      screen.queryByRole('button', { name: 'receipt.pdf' }),
    ).not.toBeInTheDocument();
  });
  it('shows upload loading and prevents duplicate interactions', async () => {
    const pending = deferred();
    mockApi({
      [`GET ${path}`]: { body: [] },
      [`POST ${path}`]: async () => {
        await pending.promise;
        return { body: attachment };
      },
    });
    renderAttachments();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Selecionar anexos').closest('label'),
      ).not.toHaveAttribute('aria-disabled', 'true'),
    );
    fireEvent.change(screen.getByLabelText('Selecionar anexos'), {
      target: {
        files: [
          new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' }),
        ],
      },
    });
    expect(await screen.findByLabelText('A enviar anexos')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Selecionar anexos').closest('label'),
    ).toHaveAttribute('aria-disabled', 'true');
    await act(async () => pending.resolve());
    await waitFor(() =>
      expect(
        screen.queryByLabelText('A enviar anexos'),
      ).not.toBeInTheDocument(),
    );
  });
  it('opens a full screen preview and lets the user retry a failed private load', async () => {
    const pending = deferred();
    mockApi({
      [`GET ${path}`]: { body: [attachment] },
      [`GET ${path}/attachment/download`]: async () => {
        await pending.promise;
        return { status: 500, body: { message: 'Falha no download' } };
      },
    });
    renderAttachments();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver receipt.pdf' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'receipt.pdf' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText('A carregar receipt.pdf').length,
    ).toBeGreaterThan(0);
    await act(async () => pending.resolve());
    await screen.findByText(
      'Não foi possível carregar este documento. Tente novamente.',
    );
    expect(
      screen.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Fechar visualização' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Renomear receipt.pdf' }),
    ).toBeEnabled();
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });
});
