import { SortableTable } from '../components/SortableTable';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Stack,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { Page } from '@church/shared';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { InvoiceLink, type Invoice } from './BankInvoices';
import { EfaturaFetch } from './EfaturaFetch';

type BankImport = {
  id: string;
  filename: string;
  status: string;
  _count: { transactions: number };
};

export function InvoicesPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [importId, setImportId] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(search);
  const canFetch = (
    [
      'FINANCE_INVOICE_IMPORT',
      'FINANCE_BANK_IMPORT',
      'FINANCE_CONTRIBUTION_READ',
    ] as const
  ).every(hasPermission);
  const invoices = useQuery({
    queryKey: ['finance', 'invoices', 'table', debounced, page],
    queryFn: () =>
      apiRequest<Page<Invoice>>('/finance/invoices', {
        query: { search: debounced, page, pageSize: 20 },
      }),
  });
  const imports = useQuery({
    queryKey: ['finance', 'invoices', 'bank-import-options'],
    enabled: canFetch,
    queryFn: async () => {
      const items: BankImport[] = [];
      let nextPage = 1;
      while (true) {
        const result = await apiRequest<Page<BankImport>>(
          '/finance/banking/imports',
          { query: { page: nextPage, pageSize: 100 } },
        );
        items.push(...result.items);
        if (!result.items.length || items.length >= result.total) break;
        nextPage++;
      }
      return items.filter(
        (item) =>
          ['CONFIRMED', 'READY_FOR_REVIEW'].includes(item.status) &&
          item._count.transactions > 0,
      );
    },
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Faturas</Typography>
      <Typography color="text.secondary">
        Consulte as faturas recuperadas do e-Fatura.
      </Typography>
      {canFetch && (
        <>
          <TextField
            select
            label="Extrato para consulta do e-Fatura"
            value={importId}
            disabled={imports.isPending || open}
            onChange={(event) => setImportId(event.target.value)}
            slotProps={{ select: { native: true } }}
            helperText="O scraper consulta o período dos movimentos do extrato selecionado."
          >
            <option value="">Selecione um extrato</option>
            {imports.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.filename}
              </option>
            ))}
          </TextField>
          {imports.error && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void imports.refetch()}>
                  Tentar novamente
                </Button>
              }
            >
              {imports.error.message}
            </Alert>
          )}
          {imports.data?.length === 0 && (
            <Alert severity="info">
              Importe e processe um extrato bancário para executar o scraper.
            </Alert>
          )}
          <EfaturaFetch
            importId={importId}
            open={open}
            onOpenChange={setOpen}
            disabled={!importId}
            standalone
          />
        </>
      )}
      <TextField
        label="Pesquisar emitente, NIF ou número"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {invoices.isFetching && (
        <Typography role="status">Carregando faturas…</Typography>
      )}
      {invoices.error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void invoices.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {invoices.error.message}
        </Alert>
      )}
      {invoices.data?.total === 0 && (
        <Alert severity="info">Nenhuma fatura encontrada.</Alert>
      )}
      <TableContainer>
        <SortableTable
          nonSortableColumns={[6]}
          aria-label="Faturas recuperadas do e-Fatura"
        >
          <TableHead>
            <TableRow>
              {[
                'Data',
                'Emitente',
                'NIF',
                'Número',
                'Valor',
                'Associação',
                'Documentos',
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.data?.items.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{invoice.date.slice(0, 10)}</TableCell>
                <TableCell>{invoice.issuerName}</TableCell>
                <TableCell>{invoice.issuerTaxId}</TableCell>
                <TableCell>{invoice.number}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {invoice.amount} {invoice.currency}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={invoice.expenseId ? 'success' : 'default'}
                    label={invoice.expenseId ? 'Associada' : 'Não associada'}
                  />
                </TableCell>
                <TableCell>
                  <InvoiceLink invoice={invoice} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </SortableTable>
      </TableContainer>
      <Stack direction="row" spacing={2} alignItems="center">
        <Button
          disabled={page === 1 || invoices.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <Typography>
          Página {page} · {invoices.data?.total ?? 0} faturas
        </Typography>
        <Button
          disabled={
            page * 20 >= (invoices.data?.total ?? 0) || invoices.isFetching
          }
          onClick={() => setPage(page + 1)}
        >
          Seguinte
        </Button>
      </Stack>
    </Stack>
  );
}
