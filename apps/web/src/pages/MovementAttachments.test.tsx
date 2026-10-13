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
    fireEvent.change(screen.getByLabelText('Nome do arquivo'), {
      target: { value: 'Comprovante' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByLabelText('Renomeando anexo'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salvando/ })).toBeDisabled();
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
      await screen.findByRole('button', { name: 'Excluir receipt.pdf' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Excluir anexo?');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir anexo' }));
    expect(await screen.findByLabelText('Excluindo anexo')).toBeInTheDocument();
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
    expect(await screen.findByLabelText('Enviando anexos')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Selecionar anexos').closest('label'),
    ).toHaveAttribute('aria-disabled', 'true');
    await act(async () => pending.resolve());
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Enviando anexos'),
      ).not.toBeInTheDocument(),
    );
  });
  it('shows download loading and surfaces a failure without leaving buttons blocked', async () => {
    const pending = deferred();
    mockApi({
      [`GET ${path}`]: { body: [attachment] },
      [`GET ${path}/attachment/download`]: async () => {
        await pending.promise;
        return { status: 500, body: { message: 'Falha no download' } };
      },
    });
    renderAttachments();
    fireEvent.click(await screen.findByRole('button', { name: 'receipt.pdf' }));
    expect(await screen.findByLabelText('Baixando anexo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Renomear receipt.pdf' }),
    ).toBeDisabled();
    await act(async () => pending.resolve());
    await screen.findByText('Falha no download');
    expect(
      screen.getByRole('button', { name: 'Renomear receipt.pdf' }),
    ).toBeEnabled();
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });
});
