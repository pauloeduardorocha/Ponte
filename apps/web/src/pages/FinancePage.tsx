import { EntitySelect } from '../components/EntitySelect';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { FinancialDashboardPanel } from './FinancialDashboardPanel';
import { StatusChip } from '../components/DataPresentation';
import { ReportsPage } from './ReportsPage';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BankingPage } from './BankingPage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import type { Page, Permission } from '@church/shared';
import { apiRequest, getAccessToken } from '../lib/api';
import { useAuth } from '../auth/auth-context';
type RecordData = {
  id: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  parent?: { name: string } | null;
  currency?: string;
  account?: { currency: string };
  category?: { name: string };
  description?: string;
  date?: string;
  amount?: string;
  status?: string;
  filename?: string;
  type?: string;
  income?: RecordData;
  member?: { name: string };
  bankTransaction?: { import: { filename: string } };
} & Record<string, unknown>;
const modules = [
  {
    route: 'banking',
    label: 'Importação bancária',
    read: 'FINANCE_BANK_IMPORT',
  },
  { route: 'dashboard', label: 'Resumo', read: 'FINANCE_DASHBOARD_READ' },
  {
    route: 'incomes',
    label: 'Receitas',
    read: 'FINANCE_TRANSACTION_READ',
    write: 'FINANCE_TRANSACTION_CREATE',
    update: 'FINANCE_TRANSACTION_UPDATE',
  },
  {
    route: 'expenses',
    label: 'Despesas',
    read: 'FINANCE_TRANSACTION_READ',
    write: 'FINANCE_TRANSACTION_CREATE',
    update: 'FINANCE_TRANSACTION_UPDATE',
  },
  {
    route: 'categories',
    label: 'Categorias',
    read: 'FINANCE_CATEGORY_READ',
    write: 'FINANCE_CATEGORY_WRITE',
    update: 'FINANCE_CATEGORY_WRITE',
  },
  {
    route: 'accounts',
    label: 'Contas',
    read: 'FINANCE_ACCOUNT_READ',
    write: 'FINANCE_ACCOUNT_WRITE',
    update: 'FINANCE_ACCOUNT_WRITE',
  },
  {
    route: 'suppliers',
    label: 'Fornecedores',
    read: 'FINANCE_SUPPLIER_READ',
    write: 'FINANCE_SUPPLIER_WRITE',
    update: 'FINANCE_SUPPLIER_WRITE',
  },
  {
    route: 'contributions',
    label: 'Contribuições',
    read: 'FINANCE_CONTRIBUTION_READ',
    write: 'FINANCE_CONTRIBUTION_WRITE',
    update: 'FINANCE_CONTRIBUTION_WRITE',
  },
  { route: 'reports', label: 'Relatórios', read: 'FINANCE_TRANSACTION_READ' },
] as const;
type Field = {
  key: string;
  label: string;
  required?: boolean;
  options?: string[];
  type?: string;
};
const transaction: Field[] = [
  { key: 'amount', label: 'Valor', required: true },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'categoryId', label: 'Categoria', required: true },
  { key: 'accountId', label: 'Conta', required: true },
  { key: 'description', label: 'Descrição', required: true },
  { key: 'costCenter', label: 'Centro de custo' },
  {
    key: 'status',
    label: 'Status',
    options: ['PENDING', 'COMPLETED', 'CANCELLED'],
  },
];
const fields: Record<string, Field[]> = {
  categories: [
    { key: 'name', label: 'Nome', required: true },
    {
      key: 'kind',
      label: 'Tipo',
      options: ['INCOME', 'EXPENSE'],
      required: true,
    },
    { key: 'parentId', label: 'Categoria pai' },
  ],
  accounts: [
    { key: 'bank', label: 'Banco', required: true },
    { key: 'name', label: 'Nome', required: true },
    { key: 'branch', label: 'Agência' },
    { key: 'account', label: 'Conta' },
    { key: 'iban', label: 'IBAN' },
    { key: 'currency', label: 'Moeda ISO (EUR, BRL)', required: true },
    { key: 'openingBalance', label: 'Saldo inicial', required: true },
    { key: 'status', label: 'Status', options: ['ACTIVE', 'INACTIVE'] },
  ],
  suppliers: [
    { key: 'name', label: 'Nome', required: true },
    { key: 'taxId', label: 'Identificação fiscal' },
    { key: 'email', label: 'E-mail' },
    { key: 'phone', label: 'Telefone' },
  ],
  incomes: [
    ...transaction,
    { key: 'origin', label: 'Origem', required: true },
    { key: 'memberId', label: 'Membro (opcional)' },
    { key: 'reference', label: 'Referência' },
  ],
  expenses: [
    ...transaction,
    { key: 'dueDate', label: 'Vencimento', type: 'date', required: true },
    { key: 'paidAt', label: 'Pagamento', type: 'date' },
    { key: 'supplierId', label: 'Fornecedor' },
    { key: 'document', label: 'Documento' },
  ],
  contributions: [
    { key: 'incomeId', label: 'Receita', required: true },
    { key: 'memberId', label: 'Membro', required: true },
    {
      key: 'type',
      label: 'Tipo',
      required: true,
      options: ['TITHE', 'OFFERING', 'DONATION', 'OTHER'],
    },
  ],
};
const labels: Record<string, string> = {
  income: 'Receitas do mês',
  expenses: 'Despesas do mês',
  balance: 'Saldo',
  pendingIncome: 'Receitas pendentes',
  pendingExpenses: 'Despesas pendentes',
  tithes: 'Dízimos',
  offerings: 'Ofertas',
  PENDING: 'Pendente',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  TITHE: 'Dízimo',
  OFFERING: 'Oferta',
  DONATION: 'Doação',
  OTHER: 'Outro',
};
async function privateFile(path: string, options?: RequestInit) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? '/api/v1'}/finance${path}`,
    { ...options, headers: { Authorization: `Bearer ${getAccessToken()}` } },
  );
  if (!response.ok)
    throw new Error(
      'Não foi possível acessar o documento. Verifique a sessão, permissão e formato.',
    );
  return response;
}
export function FinancePage() {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const allowed = modules.filter(
    (m) =>
      hasPermission(m.read) &&
      (m.route !== 'banking' || hasPermission('FINANCE_CONTRIBUTION_READ')),
  );
  const [selected, setSelected] = useState('');
  const current =
    allowed.find((m) => m.route === (params.get('tab') ?? selected)) ??
    allowed[0];
  const route = current?.route ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  }
  const [edit, setEdit] = useState<RecordData | null | undefined>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileExpense, setFileExpense] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [deleteAccountTarget, setDeleteAccountTarget] =
    useState<RecordData | null>(null);
  const deleteAccount = useMutation({
    mutationFn: () =>
      apiRequest(`/finance/accounts/${deleteAccountTarget!.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setDeleteAccountTarget(null);
      setNotice('Conta bancária excluída.');
      void client.invalidateQueries({ queryKey: ['finance'] });
      void client.invalidateQueries({ queryKey: ['entity-options'] });
    },
  });
  const data = useQuery({
    queryKey: ['finance', route, page, params.toString(), debouncedSearch],
    queryFn: () =>
      apiRequest<Page<RecordData>>(`/finance/${route}`, {
        query: {
          page,
          id: params.get('record'),
          status: params.get('status'),
          start: params.get('start'),
          end: params.get('end'),
          accountId: params.get('accountId'),
          categoryId: params.get('categoryId'),
          type: params.get('type'),
          search:
            route === 'incomes' && !hasPermission('FINANCE_CONTRIBUTION_READ')
              ? undefined
              : debouncedSearch || undefined,
        },
      }),
    enabled:
      Boolean(current) && !['dashboard', 'banking', 'reports'].includes(route),
  });
  const useLookup = (name: string, permission: Permission) =>
    useQuery({
      queryKey: ['finance', 'lookup', name],
      queryFn: () =>
        apiRequest<Page<RecordData>>(`/finance/${name}`, {
          query: { pageSize: 100 },
        }),
      enabled:
        (edit !== undefined ||
          ['incomes', 'expenses', 'contributions'].includes(route)) &&
        hasPermission(permission),
    });
  const categories = useLookup('categories', 'FINANCE_CATEGORY_READ'),
    accounts = useLookup('accounts', 'FINANCE_ACCOUNT_READ');
  const attachments = useQuery({
    queryKey: ['finance', 'attachments', fileExpense],
    queryFn: () =>
      apiRequest<RecordData[]>(`/finance/expenses/${fileExpense}/attachments`),
    enabled: Boolean(fileExpense) && hasPermission('FINANCE_ATTACHMENT_READ'),
  });
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string | null> = {};
      for (const f of fields[route] ?? []) {
        if (
          edit &&
          values[f.key] ===
            String(edit[f.key] ?? '').slice(
              0,
              f.type === 'date' ? 10 : undefined,
            )
        )
          continue;
        if (values[f.key])
          body[f.key] = ['amount', 'openingBalance'].includes(f.key)
            ? values[f.key]!.replace(',', '.')
            : values[f.key]!;
        else if (edit?.[f.key] && !f.required) body[f.key] = null;
      }
      return apiRequest(`/finance/${route}${edit ? '/' + edit.id : ''}`, {
        method: edit ? 'PATCH' : 'POST',
        body,
      });
    },
    onSuccess: () => {
      setEdit(undefined);
      setNotice('Registro salvo com sucesso.');
      void client.invalidateQueries({ queryKey: ['finance'] });
      void client.invalidateQueries({ queryKey: ['entity-options'] });
    },
  });
  function open(item: RecordData | null) {
    save.reset();
    setSubmitted(false);
    setEdit(item);
    setValues(
      Object.fromEntries(
        (fields[route] ?? []).map((f) => [
          f.key,
          item
            ? String(item[f.key] ?? '').slice(
                0,
                f.type === 'date' ? 10 : undefined,
              )
            : f.key === 'status'
              ? route === 'accounts'
                ? 'ACTIVE'
                : 'PENDING'
              : f.key === 'openingBalance'
                ? '0.00'
                : '',
        ]),
      ),
    );
  }
  if (!current)
    return <Alert severity="warning">Sem permissão financeira.</Alert>;
  const error = data.error;
  const canWrite =
    'write' in current &&
    hasPermission(current.write) &&
    (route !== 'contributions' || hasPermission('FINANCE_CONTRIBUTION_READ'));
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Financeiro</Typography>
      <Tabs
        value={route}
        onChange={(_, v: string) => {
          setSelected(v);
          setParams({ tab: v });
          setPage(1);
        }}
        variant="scrollable"
      >
        {allowed.map((m) => (
          <Tab key={m.route} value={m.route} label={m.label} />
        ))}
      </Tabs>
      {route === 'banking' && <BankingPage />}
      {route === 'reports' && <ReportsPage />}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void data.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}
      {data.isFetching && <Typography>Carregando…</Typography>}
      {route === 'dashboard' && <FinancialDashboardPanel />}
      {canWrite && (
        <Button variant="contained" onClick={() => open(null)}>
          Cadastrar {current.label.toLowerCase()}
        </Button>
      )}
      {!['dashboard', 'banking', 'reports'].includes(route) && (
        <>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            gap={2}
            flexWrap="wrap"
          >
            {['incomes', 'expenses', 'contributions'].includes(route) &&
              hasPermission('FINANCE_ACCOUNT_READ') && (
                <TextField
                  select
                  label="Filtrar conta"
                  value={params.get('accountId') ?? ''}
                  onChange={(e) => filter('accountId', e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">Todas as contas</MenuItem>
                  {accounts.data?.items.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            {['incomes', 'expenses'].includes(route) &&
              hasPermission('FINANCE_CATEGORY_READ') && (
                <TextField
                  select
                  label="Filtrar categoria"
                  value={params.get('categoryId') ?? ''}
                  onChange={(e) => filter('categoryId', e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">Todas as categorias</MenuItem>
                  {categories.data?.items
                    .filter(
                      (c) =>
                        c.kind === (route === 'incomes' ? 'INCOME' : 'EXPENSE'),
                    )
                    .map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
            <Button
              onClick={() => {
                setParams({ tab: route });
                setSearch('');
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
            {route !== 'contributions' &&
              (route !== 'incomes' ||
                hasPermission('FINANCE_CONTRIBUTION_READ')) && (
                <TextField
                  label="Pesquisar"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  sx={{ flex: 1 }}
                />
              )}
            {['incomes', 'expenses'].includes(route) && (
              <TextField
                select
                label="Status"
                value={params.get('status') ?? ''}
                onChange={(e) => filter('status', e.target.value)}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">Todos</MenuItem>
                {['PENDING', 'COMPLETED', 'CANCELLED'].map((v) => (
                  <MenuItem key={v} value={v}>
                    {labels[v]}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {['incomes', 'expenses', 'contributions'].includes(route) && (
              <>
                <TextField
                  type="date"
                  label="De"
                  value={params.get('start') ?? ''}
                  onChange={(e) => filter('start', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="date"
                  label="Até"
                  value={params.get('end') ?? ''}
                  onChange={(e) => filter('end', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </>
            )}
            {route === 'contributions' && (
              <TextField
                select
                label="Tipo de contribuição"
                value={params.get('type') ?? ''}
                onChange={(e) => filter('type', e.target.value)}
              >
                <MenuItem value="">Todos</MenuItem>
                {['TITHE', 'OFFERING', 'DONATION', 'OTHER'].map((v) => (
                  <MenuItem key={v} value={v}>
                    {labels[v]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          {data.data?.items.length === 0 && (
            <Alert severity="info">Nenhum registro.</Alert>
          )}
          {data.data?.items.map((item) => (
            <Card
              key={item.id}
              sx={{
                borderLeft: 4,
                borderColor:
                  route === 'incomes'
                    ? 'success.main'
                    : route === 'expenses'
                      ? 'error.main'
                      : 'primary.main',
              }}
            >
              <CardContent>
                <Stack spacing={1}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap={2}
                  >
                    <Typography fontWeight={600}>
                      {item.name ??
                        item.description ??
                        item.member?.name ??
                        item.type}
                    </Typography>
                    {item.amount && (
                      <Typography
                        variant="h6"
                        sx={{
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        color={
                          route === 'incomes' ? 'success.main' : 'error.main'
                        }
                      >
                        {item.amount} {item.account?.currency ?? item.currency}
                      </Typography>
                    )}
                  </Stack>
                  {item.category && (
                    <Typography variant="body2">
                      Categoria: {item.category.name}
                    </Typography>
                  )}
                  <Typography>
                    {item.currency} {item.date?.slice(0, 10)}{' '}
                    {item.status && <StatusChip status={item.status} />}{' '}
                    {item.kind && labels[item.kind]}
                  </Typography>
                  {item.parentId && (
                    <Typography>
                      Categoria pai: {item.parent?.name ?? item.parentId}
                    </Typography>
                  )}
                  {route === 'contributions' && (
                    <Typography>
                      {labels[item.type!]} · Receita {item.income?.id} ·{' '}
                      {item.income?.amount} · Origem{' '}
                      {String(item.income?.origin ?? '')}{' '}
                      {item.income?.bankTransaction?.import.filename}
                    </Typography>
                  )}
                  {route === 'accounts' && (
                    <Typography variant="body2">
                      Banco: {String(item.bank ?? '')} · Conta:{' '}
                      {String(item.account ?? '—')} · Agência:{' '}
                      {String(item.branch ?? '—')} · IBAN:{' '}
                      {String(item.iban ?? '—')} · Saldo inicial:{' '}
                      {String(item.openingBalance ?? '0')} {item.currency}
                    </Typography>
                  )}
                  {route === 'suppliers' && (
                    <Typography variant="body2">
                      {String(item.email ?? '')} {String(item.phone ?? '')}{' '}
                      {String(item.taxId ?? '')}
                    </Typography>
                  )}
                  {route === 'expenses' && (
                    <Typography variant="body2">
                      Vencimento: {String(item.dueDate ?? '').slice(0, 10)} ·
                      Pagamento:{' '}
                      {item.paidAt
                        ? String(item.paidAt).slice(0, 10)
                        : 'Pendente'}
                    </Typography>
                  )}
                  <Typography variant="caption">ID: {item.id}</Typography>
                  {typeof item.income?.bankTransactionId === 'string' &&
                    hasPermission('FINANCE_BANK_IMPORT') &&
                    hasPermission('FINANCE_CONTRIBUTION_READ') && (
                      <Button
                        component={Link}
                        to={`?tab=banking&transactionId=${item.income.bankTransactionId}`}
                      >
                        Ver origem da contribuição
                      </Button>
                    )}
                  {typeof item.bankTransactionId === 'string' &&
                    hasPermission('FINANCE_BANK_IMPORT') &&
                    hasPermission('FINANCE_CONTRIBUTION_READ') && (
                      <Button
                        component={Link}
                        to={`?tab=banking&transactionId=${item.bankTransactionId}`}
                      >
                        Ver origem bancária
                      </Button>
                    )}
                  <Stack direction="row" gap={1}>
                    {route === 'accounts' &&
                      hasPermission('FINANCE_ACCOUNT_WRITE') && (
                        <Button
                          color="error"
                          onClick={() => {
                            deleteAccount.reset();
                            setDeleteAccountTarget(item);
                          }}
                        >
                          Excluir conta
                        </Button>
                      )}
                    {'update' in current && hasPermission(current.update) && (
                      <Button onClick={() => open(item)}>Editar</Button>
                    )}
                    {route === 'expenses' &&
                      (hasPermission('FINANCE_ATTACHMENT_READ') ||
                        hasPermission('FINANCE_ATTACHMENT_WRITE')) && (
                        <Button
                          onClick={() => {
                            setFileExpense(item.id);
                            setFileError('');
                          }}
                        >
                          Documentos
                        </Button>
                      )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
          <Stack direction="row" gap={2}>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Typography>Página {page}</Typography>
            <Button
              disabled={
                !data.data || page * data.data.pageSize >= data.data.total
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </Stack>
        </>
      )}
      <Dialog
        open={edit !== undefined}
        onClose={() => setEdit(undefined)}
        fullWidth
      >
        <DialogTitle>
          {edit ? 'Editar' : 'Cadastrar'} {current.label.toLowerCase()}
        </DialogTitle>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (
              (fields[route] ?? []).some(
                (f) => f.required && !values[f.key]?.trim(),
              )
            )
              return;
            save.mutate();
          }}
        >
          <DialogContent>
            <Stack
              spacing={2}
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2,minmax(0,1fr))',
                },
                gap: 2,
              }}
            >
              {save.error && (
                <Alert severity="error">{save.error.message}</Alert>
              )}
              {(fields[route] ?? [])
                .filter(
                  (f) =>
                    f.key !== 'memberId' ||
                    route === 'contributions' ||
                    hasPermission('FINANCE_CONTRIBUTION_READ'),
                )
                .map((f) => {
                  const endpoint =
                    f.key === 'memberId'
                      ? '/finance/members'
                      : f.key === 'incomeId'
                        ? '/finance/incomes'
                        : f.key === 'categoryId' || f.key === 'parentId'
                          ? '/finance/categories'
                          : f.key === 'accountId'
                            ? '/finance/accounts'
                            : f.key === 'supplierId'
                              ? '/finance/suppliers'
                              : undefined;
                  if (endpoint)
                    return (
                      <EntitySelect
                        key={f.key}
                        endpoint={endpoint}
                        excludeId={f.key === 'parentId' ? edit?.id : undefined}
                        kind={
                          f.key === 'categoryId'
                            ? route === 'incomes'
                              ? 'INCOME'
                              : 'EXPENSE'
                            : undefined
                        }
                        label={f.label}
                        required={f.required}
                        onInvalid={() => setSubmitted(true)}
                        error={
                          submitted &&
                          Boolean(f.required) &&
                          !values[f.key]?.trim()
                        }
                        helperText={
                          submitted && f.required && !values[f.key]?.trim()
                            ? 'Campo obrigatório'
                            : undefined
                        }
                        value={values[f.key] ?? ''}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.value }))
                        }
                      />
                    );
                  return (
                    <TextField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      onInvalid={() => setSubmitted(true)}
                      error={
                        submitted &&
                        Boolean(f.required) &&
                        !values[f.key]?.trim()
                      }
                      helperText={
                        submitted && f.required && !values[f.key]?.trim()
                          ? 'Campo obrigatório'
                          : ['amount', 'openingBalance'].includes(f.key)
                            ? 'Valor com até duas casas decimais'
                            : undefined
                      }
                      type={f.type ?? 'text'}
                      select={Boolean(f.options)}
                      value={values[f.key] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value }))
                      }
                      slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: ['amount', 'openingBalance'].includes(f.key)
                          ? {
                              inputMode: 'decimal',
                              pattern:
                                f.key === 'openingBalance'
                                  ? '-?[0-9]+([.,][0-9]{1,2})?'
                                  : '[0-9]+([.,][0-9]{1,2})?',
                            }
                          : undefined,
                      }}
                    >
                      {f.options && <MenuItem value="">Selecione</MenuItem>}
                      {f.options?.map((o) => (
                        <MenuItem key={o} value={o}>
                          {labels[o] ?? o}
                        </MenuItem>
                      ))}
                    </TextField>
                  );
                })}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              Salvar
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={Boolean(fileExpense)}
        onClose={() => setFileExpense(null)}
        fullWidth
      >
        <DialogTitle>Documentos privados</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {fileError && <Alert severity="error">{fileError}</Alert>}
            {attachments.error && (
              <Alert severity="error">{attachments.error.message}</Alert>
            )}
            {hasPermission('FINANCE_ATTACHMENT_WRITE') && (
              <Button component="label">
                Enviar PDF, JPEG ou PNG (até 10 MB)
                <input
                  type="file"
                  hidden
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const form = new FormData();
                      form.append('file', file);
                      await privateFile(
                        `/expenses/${fileExpense}/attachments`,
                        { method: 'POST', body: form },
                      );
                      setFileError('');
                      void client.invalidateQueries({
                        queryKey: ['finance', 'attachments'],
                      });
                    } catch (err) {
                      setFileError((err as Error).message);
                    }
                    e.target.value = '';
                  }}
                />
              </Button>
            )}
            {attachments.data?.map((a) => (
              <Button
                key={a.id}
                onClick={async () => {
                  try {
                    const response = await privateFile(
                      `/attachments/${a.id}/download`,
                    );
                    const url = URL.createObjectURL(await response.blob());
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = a.filename!;
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (err) {
                    setFileError((err as Error).message);
                  }
                }}
              >
                {a.filename}
              </Button>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteAccountTarget)}
        onClose={() => {
          if (!deleteAccount.isPending) setDeleteAccountTarget(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Excluir conta bancária?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              A conta “{deleteAccountTarget?.name}” será excluída
              permanentemente. Contas com receitas, despesas ou importações
              devem ser desativadas.
            </Typography>
            {deleteAccount.error && (
              <Alert severity="error">{deleteAccount.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={deleteAccount.isPending}
            onClick={() => setDeleteAccountTarget(null)}
          >
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {deleteAccount.isPending ? 'Excluindo…' : 'Confirmar exclusão'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
