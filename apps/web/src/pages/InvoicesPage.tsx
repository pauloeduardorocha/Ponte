import { t as translate, useLocale } from '../i18n';
import { formatDateOnly } from '../lib/format';
import { SortableTable } from '../components/SortableTable';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  period?: { start: string | null; end: string | null };
  _count: { transactions: number };
};

export function InvoicesPage() {
  useLocale();
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
      <Typography variant="h5">{translate('Faturas')}</Typography>
      <Typography color="text.secondary">
        {translate('Consulte as faturas recuperadas do e-Fatura.')}
      </Typography>
      {canFetch && (
        <>
          <TextField
            select
            label={translate('Extrato para consulta do e-Fatura')}
            value={importId}
            disabled={imports.isPending || open}
            onChange={(event) => setImportId(event.target.value)}
            slotProps={{ select: { native: true } }}
            helperText={translate(
              'O scraper consulta o período dos movimentos do extrato selecionado.',
            )}
          >
            <option value="">{translate('Selecione um extrato')}</option>
            {imports.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.period?.start && item.period.end
                  ? `${formatDateOnly(item.period.start)} a ${formatDateOnly(item.period.end)}`
                  : translate('Período indisponível')}{' '}
                · {item.filename}
              </option>
            ))}
          </TextField>
          {imports.error && (
            <Alert
              severity="error"
              action={
                <Button onClick={() => void imports.refetch()}>
                  {translate('Tentar novamente')}
                </Button>
              }
            >
              {imports.error.message}
            </Alert>
          )}
          {imports.data?.length === 0 && (
            <Alert severity="info">
              {translate(
                'Importe e processe um extrato bancário para executar o scraper.',
              )}
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
        label={translate('Pesquisar emitente, NIF ou número')}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {invoices.isFetching && (
        <Typography role="status">
          {translate('Carregando faturas…')}
        </Typography>
      )}
      {invoices.error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void invoices.refetch()}>
              {translate('Tentar novamente')}
            </Button>
          }
        >
          {invoices.error.message}
        </Alert>
      )}
      {invoices.data?.total === 0 && (
        <Alert severity="info">{translate('Nenhuma fatura encontrada.')}</Alert>
      )}
      <TableContainer>
        <SortableTable
          nonSortableColumns={[6]}
          aria-label={translate('Faturas recuperadas do e-Fatura')}
        >
          <TableHead>
            <TableRow>
              {[
                translate('Data'),
                translate('Emitente'),
                'NIF',
                translate('Número'),
                translate('Valor'),
                translate('Associação'),
                translate('Documentos'),
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.data?.items.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>{formatDateOnly(invoice.date)}</TableCell>
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
                    label={
                      invoice.expenseId
                        ? translate('Associada')
                        : translate('Não associada')
                    }
                  />
                  {invoice.expenseId &&
                    hasPermission('FINANCE_TRANSACTION_READ') && (
                      <Button
                        component={Link}
                        to={`/finance?tab=expenses&record=${encodeURIComponent(invoice.expenseId)}`}
                      >
                        {translate('Ver movimento')}
                      </Button>
                    )}
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
          {translate('Anterior')}
        </Button>
        <Typography>
          {translate('Página ')}
          {page} · {invoices.data?.total ?? 0} {translate(' faturas')}
        </Typography>
        <Button
          disabled={
            page * 20 >= (invoices.data?.total ?? 0) || invoices.isFetching
          }
          onClick={() => setPage(page + 1)}
        >
          {translate('Seguinte')}
        </Button>
      </Stack>
    </Stack>
  );
}
