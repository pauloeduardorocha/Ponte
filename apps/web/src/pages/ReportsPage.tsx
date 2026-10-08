import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { apiRequest, getAccessToken } from '../lib/api';
const reports: [string, string][] = [
  ['incomes', 'Receitas por período'],
  ['expenses', 'Despesas por período'],
  ['cash-flow', 'Fluxo de caixa'],
  ['account-balances', 'Saldo por conta'],
  ['income-categories', 'Receitas por categoria'],
  ['expense-categories', 'Despesas por categoria'],
  ['tithes', 'Dízimos'],
  ['offerings', 'Ofertas'],
  ['donations', 'Doações'],
  ['member-contributions', 'Contribuições por membro'],
  ['supplier-expenses', 'Despesas por fornecedor'],
  ['unreconciled', 'Movimentos pendentes de revisão'],
  ['monthly-evolution', 'Evolução mensal'],
  ['contribution-statement', 'Relatório individual para preparação fiscal'],
];
const sensitiveKinds = [
  'tithes',
  'offerings',
  'donations',
  'member-contributions',
  'contribution-statement',
];
type Filters = { report: string; start: string; end: string } & Record<
  string,
  string
>;
type Row = {
  id: string;
  kind: string;
  date: string;
  amount: string;
  currency: string;
  direction: string;
  description: string;
  account: string;
  category: string;
  member: string;
  supplier: string;
  contributionType: string;
  origin: string;
  reference: string;
  bankTransactionId: string | null;
  contributionId: string | null;
  status: string;
};
type Summary = {
  groupKey: string;
  label: string;
  currency: string;
  income: string;
  expenses: string;
  net: string;
  sourceIds: string[];
};
type Result = {
  report: string;
  filters: Filters;
  church: { name: string; taxId: string; address: string };
  member: { name: string } | null;
  purpose: string;
  basis: string;
  observations: string;
  rows: Row[];
  count: number;
  totals: Summary[];
  groups: Summary[];
  balances: {
    accountId: string;
    account: string;
    initialBalance: string;
    openingSources: {
      id: string;
      kind: string;
      date: string;
      amount: string;
    }[];
    currency: string;
    opening: string;
    income: string;
    expenses: string;
    closing: string;
  }[];
};
const names: Record<string, string> = {
  TITHE: 'Dízimo',
  OFFERING: 'Oferta',
  DONATION: 'Doação',
  OTHER: 'Outra',
  COMPLETED: 'Concluído',
  PENDING: 'Pendente',
  CANCELLED: 'Cancelado',
};
function FilterLookup({
  kind,
  label,
  value,
  onChange,
}: {
  kind: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const options = useQuery({
    queryKey: ['finance', 'reports', 'lookup', kind, search],
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>('/finance/reports/lookups', {
        query: { kind, search },
      }),
  });
  const [choice, setChoice] = useState<{ id: string; name: string } | null>(
    null,
  );
  return (
    <Stack>
      <Autocomplete
        options={options.data ?? []}
        value={value ? choice : null}
        getOptionLabel={(o) => o.name}
        getOptionKey={(o) => o.id}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={(o) => o}
        onInputChange={(_, text, reason) => {
          if (reason === 'input') setSearch(text);
        }}
        onChange={(_, o) => {
          setChoice(o);
          onChange(o?.id ?? '');
        }}
        renderInput={(p) => <TextField {...p} label={label} />}
      />
      {options.error && <Alert severity="error">{options.error.message}</Alert>}
    </Stack>
  );
}
export function ReportsPage() {
  const { hasPermission } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState<Filters>({
    report: 'incomes',
    start: today.slice(0, 7) + '-01',
    end: today,
  });
  const [applied, setApplied] = useState<Filters | null>(null),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  const set = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const result = useQuery({
    queryKey: ['finance', 'reports', applied],
    queryFn: () =>
      apiRequest<Result>('/finance/reports', { query: applied ?? {} }),
    enabled: Boolean(applied),
  });
  const sensitive = sensitiveKinds.includes(filters.report),
    balance = filters.report === 'account-balances',
    bank = filters.report === 'unreconciled';
  const canViewMembers = hasPermission('FINANCE_CONTRIBUTION_READ');
  async function download(format: string) {
    if (!applied) return;
    setExporting(true);
    setExportError('');
    try {
      const query = new URLSearchParams({ ...applied, format });
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? '/api/v1'}/finance/reports/export?${query}`,
        { headers: { Authorization: `Bearer ${getAccessToken()}` } },
      );
      if (!response.ok) {
        const error = (await response.json()) as { message: string | string[] };
        throw new Error(
          Array.isArray(error.message)
            ? error.message.join(', ')
            : error.message,
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${applied.report}-${applied.start}-${applied.end}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const appliedSensitive =
    applied &&
    (sensitiveKinds.includes(applied.report) ||
      applied.memberId ||
      applied.contributionType ||
      applied.report === 'unreconciled');
  const canExport =
    !appliedSensitive || hasPermission('FINANCE_CONTRIBUTION_EXPORT');
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Relatórios financeiros</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              select
              label="Relatório"
              value={filters.report}
              onChange={(e) => {
                setFilters({
                  report: e.target.value,
                  start: filters.start,
                  end: filters.end,
                });
                setApplied(null);
              }}
            >
              {reports
                .filter(
                  ([kind]) =>
                    (!sensitiveKinds.includes(kind) || canViewMembers) &&
                    (kind !== 'unreconciled' ||
                      (canViewMembers && hasPermission('FINANCE_BANK_IMPORT'))),
                )
                .map(([kind, label]) => (
                  <MenuItem key={kind} value={kind}>
                    {label}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Início do período"
                type="date"
                value={filters.start}
                onChange={(e) => set('start', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Fim do período"
                type="date"
                value={filters.end}
                onChange={(e) => set('end', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' },
                gap: 2,
              }}
            >
              <FilterLookup
                kind="accounts"
                label="Conta"
                value={filters.accountId ?? ''}
                onChange={(v) => set('accountId', v)}
              />
              {!balance && (
                <FilterLookup
                  kind="categories"
                  label="Categoria"
                  value={filters.categoryId ?? ''}
                  onChange={(v) => set('categoryId', v)}
                />
              )}
              {!balance && canViewMembers && (
                <FilterLookup
                  kind="members"
                  label="Membro"
                  value={filters.memberId ?? ''}
                  onChange={(v) => set('memberId', v)}
                />
              )}
              {!balance && !sensitive && (
                <FilterLookup
                  kind="suppliers"
                  label="Fornecedor"
                  value={filters.supplierId ?? ''}
                  onChange={(v) => set('supplierId', v)}
                />
              )}
              {!balance && !bank && (
                <TextField
                  label="Centro de custo"
                  value={filters.costCenter ?? ''}
                  onChange={(e) => set('costCenter', e.target.value)}
                />
              )}
              {!balance && filters.report !== 'cash-flow' && (
                <TextField
                  select
                  label="Status"
                  value={(bank ? filters.bankStatus : filters.status) ?? ''}
                  onChange={(e) =>
                    set(bank ? 'bankStatus' : 'status', e.target.value)
                  }
                >
                  <MenuItem value="">
                    {bank ? 'Todos os pendentes' : 'Concluídos (padrão)'}
                  </MenuItem>
                  {(bank
                    ? [
                        'PENDING_REVIEW',
                        'CLASSIFIED',
                        'REJECTED',
                        'POSSIBLE_DUPLICATE',
                      ]
                    : ['COMPLETED', 'PENDING', 'CANCELLED']
                  ).map((s) => (
                    <MenuItem key={s} value={s}>
                      {names[s] ?? s}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {sensitive &&
                !['tithes', 'offerings', 'donations'].includes(
                  filters.report,
                ) && (
                  <TextField
                    select
                    label="Tipo de contribuição"
                    value={filters.contributionType ?? ''}
                    onChange={(e) => set('contributionType', e.target.value)}
                  >
                    <MenuItem value="">Todos</MenuItem>
                    {['TITHE', 'OFFERING', 'DONATION', 'OTHER'].map((t) => (
                      <MenuItem key={t} value={t}>
                        {names[t]}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
            </Box>
            {filters.report === 'contribution-statement' && (
              <>
                <TextField
                  label="Identificação da igreja"
                  value={filters.churchName ?? ''}
                  onChange={(e) => set('churchName', e.target.value)}
                />
                <TextField
                  label="Identificação fiscal da igreja"
                  value={filters.churchTaxId ?? ''}
                  onChange={(e) => set('churchTaxId', e.target.value)}
                />
                <TextField
                  label="Endereço da igreja"
                  value={filters.churchAddress ?? ''}
                  onChange={(e) => set('churchAddress', e.target.value)}
                />
                <TextField
                  label="Observações"
                  multiline
                  value={filters.observations ?? ''}
                  onChange={(e) => set('observations', e.target.value)}
                />
              </>
            )}
            <Button
              variant="contained"
              disabled={
                !filters.start ||
                !filters.end ||
                filters.start > filters.end ||
                result.isFetching ||
                (filters.report === 'contribution-statement' &&
                  !filters.memberId)
              }
              onClick={() => {
                setExportError('');
                setApplied(
                  Object.fromEntries(
                    Object.entries(filters).filter(([, v]) => v.trim()),
                  ) as Filters,
                );
              }}
            >
              Gerar relatório
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {result.isFetching && <Typography>Gerando relatório…</Typography>}
      {result.error && <Alert severity="error">{result.error.message}</Alert>}
      {exportError && <Alert severity="error">{exportError}</Alert>}
      {result.data && !result.isFetching && (
        <>
          <Typography variant="h6">
            {reports.find(([kind]) => kind === result.data.report)?.[1]}
          </Typography>
          <Typography>
            Período: {result.data.filters.start} a {result.data.filters.end} ·{' '}
            {result.data.count} registros
          </Typography>
          {result.data.member && (
            <Typography>Membro: {result.data.member.name}</Typography>
          )}
          {result.data.report === 'contribution-statement' && (
            <>
              <Typography>
                {result.data.church.name} · {result.data.church.taxId} ·{' '}
                {result.data.church.address}
              </Typography>
              <Alert severity="info">{result.data.purpose}</Alert>
              <Typography>
                Observações: {result.data.observations || 'Sem observações'}
              </Typography>
            </>
          )}
          <Typography variant="body2">{result.data.basis}</Typography>
          <Stack direction="row" gap={1}>
            {[
              'csv',
              'xlsx',
              ...(result.data.report === 'contribution-statement'
                ? ['pdf']
                : []),
            ].map((f) => (
              <Button
                key={f}
                disabled={!canExport || exporting}
                onClick={() => void download(f)}
              >
                Exportar {f.toUpperCase()}
              </Button>
            ))}
          </Stack>
          {!canExport && (
            <Alert severity="warning">
              A exportação de dados de membros exige permissão específica.
            </Alert>
          )}
          {result.data.totals.map((t) => (
            <Typography key={t.currency} fontWeight={700}>
              Total ({t.currency}): receitas {t.income} · despesas {t.expenses}{' '}
              · líquido {t.net}
            </Typography>
          ))}
          {result.data.groups.map((g) => (
            <Stack key={g.groupKey}>
              <Typography>
                {names[g.label] ?? g.label} ({g.currency}): receitas {g.income}{' '}
                · despesas {g.expenses} · líquido {g.net}
              </Typography>
              <details>
                <summary>Ver lançamentos deste total</summary>
                {g.sourceIds.map((id) => (
                  <Button key={id} component="a" href={`#source-${id}`}>
                    Localizar lançamento{' '}
                    {result.data.rows.find((r) => r.id === id)?.date}
                  </Button>
                ))}
              </details>
            </Stack>
          ))}
          {result.data.balances.map((b) => (
            <Stack key={b.accountId}>
              <Typography>
                {b.account} ({b.currency}): saldo inicial do período {b.opening}{' '}
                · receitas {b.income} · pagamentos {b.expenses} · saldo final{' '}
                {b.closing}
              </Typography>
              <Button
                component={Link}
                to={`?tab=accounts&record=${b.accountId}`}
              >
                Saldo cadastrado: {b.initialBalance} {b.currency}
              </Button>
              {b.openingSources.map((source) => (
                <Button
                  key={source.id}
                  component={Link}
                  to={`?tab=${source.kind === 'INCOME' ? 'incomes' : 'expenses'}&record=${source.id}`}
                >
                  Origem do saldo inicial: {source.date} · {source.amount}{' '}
                  {b.currency}
                </Button>
              ))}
            </Stack>
          ))}
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    'Data',
                    'Tipo',
                    'Descrição / origem',
                    'Conta / categoria',
                    'Membro / fornecedor',
                    'Valor',
                    'Status',
                    'Referência',
                    'Rastreabilidade',
                  ].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.data.rows.map((r) => (
                  <TableRow key={r.kind + r.id} id={`source-${r.id}`}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>
                      {names[r.contributionType] ??
                        (r.direction === 'CREDIT' ? 'Receita' : 'Despesa')}
                    </TableCell>
                    <TableCell>
                      {r.description}
                      <br />
                      {r.origin}
                    </TableCell>
                    <TableCell>
                      {r.account}
                      <br />
                      {r.category || 'Sem categoria'}
                    </TableCell>
                    <TableCell>{r.member || r.supplier || '—'}</TableCell>
                    <TableCell
                      sx={{
                        whiteSpace: 'nowrap',
                        color:
                          r.direction === 'CREDIT'
                            ? 'success.main'
                            : 'error.main',
                      }}
                    >
                      {r.amount} {r.currency}
                    </TableCell>
                    <TableCell>{names[r.status] ?? r.status}</TableCell>
                    <TableCell>{r.reference || '—'}</TableCell>
                    <TableCell>
                      <Button
                        component={Link}
                        to={`?tab=${r.kind === 'BANK' ? 'banking' : r.kind === 'INCOME' ? 'incomes' : 'expenses'}&${r.kind === 'BANK' ? 'transactionId' : 'record'}=${r.id}`}
                      >
                        Abrir origem
                      </Button>
                      {r.bankTransactionId &&
                        hasPermission('FINANCE_BANK_IMPORT') &&
                        canViewMembers && (
                          <Button
                            component={Link}
                            to={`?tab=banking&transactionId=${r.bankTransactionId}`}
                          >
                            Transação bancária
                          </Button>
                        )}
                      {r.contributionId && (
                        <Button
                          component={Link}
                          to={`?tab=contributions&record=${r.contributionId}`}
                        >
                          Contribuição
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {result.data.count === 0 && (
            <Alert severity="info">
              Nenhum registro neste período e filtros.
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
}
