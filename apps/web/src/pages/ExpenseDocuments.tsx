import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { MovementAttachments } from './MovementAttachments';
import { ExpenseInvoices, type Invoice } from './BankInvoices';

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
        {expense.date?.slice(0, 10)}
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
  const [rows, setRows] = useState<Expense[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const authorized =
    hasPermission('FINANCE_TRANSACTION_READ') &&
    (hasPermission('FINANCE_ATTACHMENT_WRITE') ||
      (hasPermission('FINANCE_INVOICE_READ') &&
        hasPermission('FINANCE_INVOICE_ASSOCIATE')));
  const pending = useQuery({
    queryKey: ['finance', 'expenses', 'missing-document'],
    enabled: authorized,
    queryFn: () =>
      apiRequest<Page<Expense>>('/finance/expenses', {
        query: { missingDocument: 'true', pageSize: 1 },
      }),
  });
  const review = useMutation({
    mutationFn: async () => {
      const result: Expense[] = [];
      for (let page = 1; ; page++) {
        const batch = await apiRequest<Page<Expense>>('/finance/expenses', {
          query: { missingDocument: 'true', page, pageSize: 100 },
        });
        result.push(...batch.items);
        if (!batch.items.length || result.length >= batch.total) return result;
      }
    },
    onSuccess: (items) => {
      setRows(items);
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
              {review.isPending ? 'Carregando…' : 'Anexar documento'}
            </Button>
          }
        >
          <Typography fontWeight={600}>
            {total === 1
              ? '1 despesa sem anexo nem fatura associada'
              : `${total} despesas sem anexo nem fatura associada`}
          </Typography>
          Anexe um documento ou selecione uma fatura para comprovar a despesa.
        </Alert>
      )}
      {(pending.error || review.error) && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void pending.refetch()}>
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
          Anexar documento · {index + 1} de {rows.length}
        </DialogTitle>
        <DialogContent>
          {rows[index] && (
            <ExpenseDocumentContent
              key={rows[index].id}
              expense={rows[index]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Continuar depois</Button>
          <Button
            onClick={() => {
              if (index + 1 < rows.length) setIndex(index + 1);
              else setOpen(false);
            }}
          >
            {index + 1 < rows.length
              ? 'Próxima despesa / Pular'
              : 'Concluir revisão'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
