import { RecordTable, RecordRow } from '../components/RecordTable';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest, getAccessToken } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';
export type Invoice = {
  id: string;
  importId: string;
  issuerName: string;
  issuerTaxId: string;
  number: string;
  date: string;
  amount: string;
  currency: string;
  documentUrl: string | null;
  associatedBy?: string | null;
  expenseId?: string | null;
  score?: number;
  reasons?: string[];
};
async function invoiceFile(path: string, options?: RequestInit) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}/finance/invoices${path}`,
    { ...options, headers: { Authorization: `Bearer ${getAccessToken()}` } },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : 'Não foi possível processar as faturas',
    );
  }
  return response;
}
export function InvoiceLink({ invoice }: { invoice: Invoice }) {
  const [error, setError] = useState('');
  return (
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {invoice.documentUrl && (
        <Button
          component="a"
          href={invoice.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Abrir fatura no portal
        </Button>
      )}
      <Button
        onClick={async () => {
          try {
            const response = await invoiceFile(
              `/imports/${invoice.importId}/download`,
            );
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'faturas-originais.json';
            anchor.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Arquivo de origem
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
export function ExpenseInvoices({
  expenseId,
  invoices,
  description,
  amount,
  currency,
  canAssociate = true,
  inline = false,
  showSuggestions = true,
  onInvoicesChange,
}: {
  expenseId: string;
  invoices: Invoice[];
  description: string;
  amount: string;
  currency: string;
  canAssociate?: boolean;
  inline?: boolean;
  showSuggestions?: boolean;
  onInvoicesChange?: (invoices: Invoice[]) => void;
}) {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const readable = hasPermission('FINANCE_INVOICE_READ');
  const editable = hasPermission('FINANCE_INVOICE_ASSOCIATE') && canAssociate;
  const pickerVisible = inline
    ? showSuggestions && invoices.length === 0
    : open;
  const suggestions = useQuery({
    queryKey: ['finance', 'invoices', 'suggestions', expenseId],
    enabled: readable && pickerVisible && editable && !debounced,
    queryFn: () =>
      apiRequest<Invoice[]>(
        `/finance/invoices/expense-suggestions/${expenseId}`,
      ),
  });
  const list = useQuery({
    queryKey: ['finance', 'invoices', 'list', debounced, page],
    enabled: readable && pickerVisible && editable && Boolean(debounced),
    queryFn: () =>
      apiRequest<Page<Invoice>>('/finance/invoices', {
        query: { search: debounced, page, pageSize: 20, unassociated: 'true' },
      }),
  });
  const change = useMutation({
    mutationFn: ({ id, remove }: { id: string; remove?: boolean }) =>
      apiRequest<Invoice>(`/finance/invoices/${id}/expense-association`, {
        method: remove ? 'DELETE' : 'POST',
        ...(remove ? {} : { body: { expenseId } }),
      }),
    onSuccess: (invoice, { id, remove }) => {
      onInvoicesChange?.(
        remove
          ? invoices.filter((item) => item.id !== id)
          : [...invoices.filter((item) => item.id !== id), invoice],
      );
      void client.invalidateQueries({ queryKey: ['finance'] });
      setOpen(false);
    },
  });
  if (!readable) return null;
  const rows = (
    debounced ? (list.data?.items ?? []) : (suggestions.data ?? [])
  ).filter(
    (invoice) => !invoices.some((associated) => associated.id === invoice.id),
  );
  const picker = (
    <Stack spacing={2}>
      <Typography fontWeight={600}>
        {description} · {amount} {currency}
      </Typography>
      {change.error && <Alert severity="error">{change.error.message}</Alert>}
      <Alert severity="info">
        As sugestões não associam automaticamente. Pesquise para escolher outro
        documento; um pagamento pode incluir várias faturas.
      </Alert>
      <TextField
        label="Pesquisar emitente, NIF ou número"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {(suggestions.isFetching || list.isFetching) && (
        <Typography>Carregando faturas…</Typography>
      )}
      {(suggestions.error || list.error) && (
        <Alert severity="error">
          {(suggestions.error || list.error)?.message}
        </Alert>
      )}
      {!rows.length && !suggestions.isFetching && !list.isFetching && (
        <Typography>
          Nenhuma fatura encontrada. Importe as faturas ou pesquise outro
          documento.
        </Typography>
      )}
      <RecordTable>
        {rows.map((invoice) => (
          <RecordRow
            key={invoice.id}
            primary={
              <>
                <Typography fontWeight={600}>
                  {invoice.issuerName} · {invoice.number}
                </Typography>
              </>
            }
            actions={
              <>
                <Button
                  variant="contained"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ id: invoice.id })}
                >
                  Associar {invoice.number}
                </Button>
                <InvoiceLink invoice={invoice} />
              </>
            }
          >
            <Typography>
              {invoice.date.slice(0, 10)} · {invoice.amount} {invoice.currency}{' '}
              · NIF {invoice.issuerTaxId}
            </Typography>
            {(Math.abs(Number(invoice.amount)) !== Number(amount) ||
              invoice.currency !== currency) && (
              <Alert severity="warning">
                Valor ou moeda diferente da despesa. Confira se faz parte de um
                pagamento agrupado.
              </Alert>
            )}
            {invoice.score && (
              <Chip
                color={invoice.score >= 85 ? 'success' : 'warning'}
                label={`Compatibilidade ${invoice.score}% · confirmar manualmente`}
              />
            )}
            <Typography variant="caption">
              {invoice.reasons?.join(' · ')}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
      {debounced && (
        <Stack direction="row" gap={1}>
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <Typography>Página {page}</Typography>
          <Button
            disabled={page * 20 >= (list.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </Button>
        </Stack>
      )}
      {!inline && <Button onClick={() => setOpen(false)}>Fechar</Button>}
    </Stack>
  );
  return (
    <Box>
      <RecordTable>
        {invoices.map((invoice) => (
          <RecordRow
            key={invoice.id}
            primary={
              <>
                <Typography fontWeight={600}>
                  {invoice.issuerName} · {invoice.number}
                </Typography>
              </>
            }
            actions={
              <>
                {editable && (
                  <Button
                    color="warning"
                    disabled={change.isPending}
                    onClick={() =>
                      change.mutate({ id: invoice.id, remove: true })
                    }
                  >
                    Remover associação
                  </Button>
                )}
                <InvoiceLink invoice={invoice} />
              </>
            }
          >
            <Chip color="info" size="small" label="Fatura associada" />
            <Typography>
              {invoice.amount} {invoice.currency}
            </Typography>
            <Typography variant="caption">
              NIF {invoice.issuerTaxId} · {invoice.date.slice(0, 10)} ·
              Associada por {invoice.associatedBy}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
      {inline && editable && pickerVisible && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">Sugestões de faturas</Typography>
          {picker}
        </Box>
      )}
      {!inline && editable && (
        <Button onClick={() => setOpen(true)}>Associar fatura</Button>
      )}
      {change.error && <Alert severity="error">{change.error.message}</Alert>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Associar fatura à despesa</DialogTitle>
        <DialogContent>{picker}</DialogContent>
      </Dialog>
    </Box>
  );
}
