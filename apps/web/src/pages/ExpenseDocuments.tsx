import { formatDateOnly } from '../lib/format';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { MovementAttachments } from './MovementAttachments';
import { ExpenseInvoices, InvoiceLink, type Invoice } from './BankInvoices';
import { useDebouncedValue } from '../lib/use-debounced-value';

function ImportedInvoiceReview({ invoice }: { invoice: Invoice }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const expenses = useQuery({
    queryKey: ['finance', 'expenses', 'invoice-picker', debounced, page],
    queryFn: () =>
      apiRequest<Page<Expense>>('/finance/expenses', {
        query: { search: debounced, page, pageSize: 20 },
      }),
  });
  const association = useMutation({
    mutationFn: (expenseId: string) =>
      apiRequest<Invoice>(
        `/finance/invoices/${invoice.id}/expense-association`,
        { method: 'POST', body: { expenseId } },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  return (
    <Stack spacing={2}>
      <Typography fontWeight={600}>
        {invoice.issuerName} · {invoice.number}
      </Typography>
      <Typography>
        {formatDateOnly(invoice.date)} · {invoice.amount} {invoice.currency} ·
        NIF {invoice.issuerTaxId}
      </Typography>
      <InvoiceLink invoice={invoice} />
      {association.isSuccess ? (
        <Alert severity="success">Fatura associada à despesa.</Alert>
      ) : (
        <>
          <Alert severity="info">
            Selecione a despesa correspondente. Um pagamento pode incluir várias
            faturas; confira data, valor e moeda antes de associar.
          </Alert>
          <TextField
            label="Pesquisar despesa"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          {expenses.isFetching && <Typography>Carregando despesas…</Typography>}
          {expenses.error && (
            <Alert severity="error">{expenses.error.message}</Alert>
          )}
          {expenses.data?.total === 0 && (
            <Typography>Nenhuma despesa encontrada.</Typography>
          )}
          {expenses.data?.items.map((expense) => (
            <Stack key={expense.id} spacing={1}>
              <Typography>
                {expense.description} · {formatDateOnly(expense.date ?? null)} ·{' '}
                {expense.amount} {expense.account?.currency}
              </Typography>
              {Number(expense.amount) !== Number(invoice.amount) && (
                <Typography color="warning.main">
                  Valor diferente da fatura; confira se é um pagamento agrupado.
                </Typography>
              )}
              <Button
                disabled={
                  association.isPending ||
                  expense.account?.currency !== invoice.currency ||
                  Number(invoice.amount) <= 0
                }
                onClick={() => association.mutate(expense.id)}
              >
                Associar a {expense.description}
              </Button>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <Button
              disabled={page === 1 || expenses.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <Typography>Página {page}</Typography>
            <Button
              disabled={
                page * 20 >= (expenses.data?.total ?? 0) || expenses.isFetching
              }
              onClick={() => setPage(page + 1)}
            >
              Seguinte
            </Button>
          </Stack>
        </>
      )}
      {association.error && (
        <Alert severity="error">{association.error.message}</Alert>
      )}
    </Stack>
  );
}

type Expense = {
  id: string;
  description?: string;
  amount?: string;
  date?: string;
  account?: { currency: string };
  bankTransactionId?: unknown;
};
export function ExpenseDocumentContent({ expense }: { expense: Expense }) {
  const { hasPermission } = useAuth();
  const linked = useQuery({
    queryKey: ['finance', 'invoices', 'expense', expense.id],
    enabled: hasPermission('FINANCE_INVOICE_READ'),
    queryFn: async () => {
      const result = await apiRequest<Page<Invoice>>('/finance/invoices', {
        query: { expenseId: expense.id, pageSize: 100 },
      });
      return result.items;
    },
  });
  return (
    <Stack spacing={2}>
      <Typography fontWeight={600}>
        {expense.description} · {expense.amount} {expense.account?.currency} ·{' '}
        {formatDateOnly(expense.date ?? null)}
      </Typography>
      <MovementAttachments
        expenseId={expense.id}
        canRead={hasPermission('FINANCE_ATTACHMENT_READ')}
        canWrite={hasPermission('FINANCE_ATTACHMENT_WRITE')}
      />
      {linked.error && <Alert severity="error">{linked.error.message}</Alert>}
      {hasPermission('FINANCE_INVOICE_READ') &&
        !linked.isPending &&
        !linked.error && (
          <ExpenseInvoices
            expenseId={expense.id}
            invoices={linked.data ?? []}
            description={expense.description ?? ''}
            amount={expense.amount ?? ''}
            currency={expense.account?.currency ?? ''}
            inline
          />
        )}
    </Stack>
  );
}
export function ExpenseDocumentsAlert() {
  const { hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const authorized =
    hasPermission('FINANCE_TRANSACTION_READ') &&
    hasPermission('FINANCE_INVOICE_READ') &&
    hasPermission('FINANCE_INVOICE_ASSOCIATE');
  const pending = useQuery({
    queryKey: ['finance', 'invoices', 'unassociated-count'],
    enabled: authorized,
    queryFn: () =>
      apiRequest<Page<Invoice>>('/finance/invoices', {
        query: { unassociated: 'true', pageSize: 1 },
      }),
  });
  const review = useMutation({
    mutationFn: async () => {
      const items: Invoice[] = [];
      for (let page = 1; ; page++) {
        const batch = await apiRequest<Page<Invoice>>('/finance/invoices', {
          query: { unassociated: 'true', page, pageSize: 100 },
        });
        items.push(...batch.items);
        if (!batch.items.length || items.length >= batch.total) return items;
      }
    },
    onSuccess: (items) => {
      setInvoices(items);
      setIndex(0);
      setOpen(items.length > 0);
    },
  });
  if (!authorized) return null;
  const total = pending.data?.total ?? 0;
  return (
    <>
      {total > 0 && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              disabled={review.isPending || open}
              onClick={() => review.mutate()}
            >
              {review.isPending ? 'Carregando…' : 'Associar faturas'}
            </Button>
          }
        >
          <Typography fontWeight={600}>
            {total === 1
              ? '1 fatura sem movimento associado'
              : `${total} faturas sem movimento associado`}
          </Typography>
          Selecione um movimento para associar a cada fatura importada do
          e-Fatura.
        </Alert>
      )}
      {(pending.error || review.error) && (
        <Alert
          severity="error"
          action={
            <Button
              onClick={() =>
                review.error ? review.mutate() : void pending.refetch()
              }
            >
              Tentar novamente
            </Button>
          }
        >
          {(pending.error || review.error)?.message}
        </Alert>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
        aria-labelledby="expense-documents-title"
      >
        <DialogTitle id="expense-documents-title">
          Associar faturas importadas · {index + 1} de {invoices.length}
        </DialogTitle>
        <DialogContent>
          {invoices[index] && (
            <ImportedInvoiceReview
              key={invoices[index].id}
              invoice={invoices[index]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Continuar depois</Button>
          <Button
            onClick={() => {
              if (index + 1 < invoices.length) setIndex(index + 1);
              else setOpen(false);
            }}
          >
            {index + 1 < invoices.length
              ? 'Próxima fatura / Pular'
              : 'Concluir revisão'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
