import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import {
  MetricCard,
  MoneyTrend,
  StatusChip,
} from '../components/DataPresentation';
type Balance = {
  currency: string;
  income: string;
  expenses: string;
  balance: string;
  pendingIncome: string;
  pendingExpenses: string;
  tithes?: string;
  offerings?: string;
};
export interface FinancialDashboard {
  month: string;
  balances: Balance[];
  trend?: {
    month: string;
    currency: string;
    income: string;
    expenses: string;
  }[];
  unreconciled?: number;
  latestImport?: {
    id: string;
    filename: string;
    createdAt?: string;
    status: string;
    _count: { transactions: number };
  } | null;
  latestTransactions: {
    id: string;
    kind: string;
    date: string;
    amount: string;
    currency?: string;
    description: string;
    status: string;
  }[];
}
export function FinancialDashboardPanel() {
  const { hasPermission } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [accountId, setAccountId] = useState('');
  const data = useQuery({
    queryKey: ['finance', 'dashboard', month, accountId],
    queryFn: () =>
      apiRequest<FinancialDashboard>('/finance/dashboard', {
        query: { month, accountId },
      }),
    enabled: hasPermission('FINANCE_DASHBOARD_READ'),
    staleTime: 30000,
  });
  const accounts = useQuery({
    queryKey: ['finance', 'dashboard-accounts'],
    queryFn: () =>
      apiRequest<{ items: { id: string; name: string }[] }>(
        '/finance/accounts',
        { query: { pageSize: 100 } },
      ),
    enabled: hasPermission('FINANCE_ACCOUNT_READ'),
    staleTime: 60000,
  });
  const money = (v: string, currency: string) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
      Number(v),
    );
  const nextMonth = new Date(month + '-01T00:00:00Z');
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  const period = `&start=${month}-01&end=${nextMonth.toISOString().slice(0, 10)}${accountId ? '&accountId=' + accountId : ''}`;
  const list = hasPermission('FINANCE_TRANSACTION_READ');
  const contribution = hasPermission('FINANCE_CONTRIBUTION_READ');
  const banking = hasPermission('FINANCE_BANK_IMPORT') && contribution;
  if (!hasPermission('FINANCE_DASHBOARD_READ')) return null;
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        gap={2}
      >
        <Box>
          <Typography variant="h5">Financeiro — visão geral</Typography>
          <Typography variant="body2" color="text.secondary">
            Resultados do mês; saldo até o fim do período e pendências gerais.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <TextField
            label="Mês"
            type="month"
            value={month}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: {
                min: '2000-01',
                max: new Date().toISOString().slice(0, 7),
              },
            }}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
          {hasPermission('FINANCE_ACCOUNT_READ') && (
            <TextField
              select
              label="Conta"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Todas as contas</MenuItem>
              {accounts.data?.items.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Stack>
      {data.isPending && (
        <Skeleton
          variant="rounded"
          height={200}
          aria-label="Carregando painel financeiro"
        />
      )}
      {data.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void data.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar o financeiro.
        </Alert>
      )}
      {accounts.isError && (
        <Alert severity="warning">
          Não foi possível carregar o filtro de contas.
        </Alert>
      )}
      {data.data?.balances.length === 0 && (
        <Alert severity="info">
          Cadastre uma conta bancária para começar a acompanhar o financeiro.
        </Alert>
      )}
      {data.data?.balances.map((b) => (
        <Stack spacing={2} key={b.currency}>
          <Box className="metric-grid">
            {[
              {
                label: 'Receitas',
                value: b.income,
                color: 'success.main',
                href: list ? '/finance?tab=incomes' + period : undefined,
              },
              {
                label: 'Despesas',
                value: b.expenses,
                color: 'error.main',
                href: list ? '/finance?tab=expenses' + period : undefined,
              },
              {
                label: 'Saldo',
                value: b.balance,
                color: Number(b.balance) < 0 ? 'error.main' : 'primary.main',
                href: hasPermission('FINANCE_ACCOUNT_READ')
                  ? '/finance?tab=accounts'
                  : undefined,
              },
              {
                label: 'Receitas pendentes',
                value: b.pendingIncome,
                color: 'warning.dark',
                href: list ? '/finance?tab=incomes&status=PENDING' : undefined,
              },
              {
                label: 'Despesas pendentes',
                value: b.pendingExpenses,
                color: 'warning.dark',
                href: list ? '/finance?tab=expenses&status=PENDING' : undefined,
              },
              ...(contribution
                ? [
                    {
                      label: 'Dízimos',
                      value: b.tithes ?? '0',
                      color: 'info.main',
                      href: '/finance?tab=contributions&type=TITHE' + period,
                    },
                    {
                      label: 'Ofertas',
                      value: b.offerings ?? '0',
                      color: 'secondary.main',
                      href: '/finance?tab=contributions&type=OFFERING' + period,
                    },
                  ]
                : []),
            ].map((v) => (
              <MetricCard
                key={v.label}
                {...v}
                value={money(v.value, b.currency)}
                detail={b.currency}
              />
            ))}
          </Box>
          <MoneyTrend
            currency={b.currency}
            rows={Array.from({ length: 6 }, (_, i) => {
              const d = new Date(month + '-01T00:00:00Z');
              d.setUTCMonth(d.getUTCMonth() - 5 + i);
              const m = d.toISOString().slice(0, 7);
              return (
                data.data?.trend?.find(
                  (t) => t.month === m && t.currency === b.currency,
                ) ?? { month: m, income: '0', expenses: '0' }
              );
            })}
          />
        </Stack>
      ))}
      {data.data && (
        <Box className="metric-grid">
          <MetricCard
            label="Movimentos pendentes de revisão"
            value={data.data.unreconciled ?? 0}
            color="warning.dark"
            href={
              banking ? '/finance?tab=banking&unreconciled=true' : undefined
            }
          />
          {banking && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Última importação
                </Typography>
                {data.data.latestImport ? (
                  <>
                    <Typography
                      sx={{ my: 1, overflowWrap: 'anywhere' }}
                      fontWeight={700}
                    >
                      {data.data.latestImport.filename}
                    </Typography>
                    {data.data.latestImport.createdAt && (
                      <Typography variant="caption">
                        {new Date(
                          data.data.latestImport.createdAt,
                        ).toLocaleString('pt-PT')}
                      </Typography>
                    )}
                    <StatusChip status={data.data.latestImport.status} />
                    <Button
                      component={Link}
                      to={`/finance?tab=banking&importId=${data.data.latestImport.id}`}
                    >
                      Revisar {data.data.latestImport._count.transactions}{' '}
                      movimentos
                    </Button>
                  </>
                ) : (
                  <Typography sx={{ my: 1 }}>
                    Nenhuma importação.{' '}
                    <Button component={Link} to="/finance?tab=banking">
                      Importar extrato
                    </Button>
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      )}
      {list && data.data && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">Últimos lançamentos do período</Typography>
            {data.data.latestTransactions.length === 0 && (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                Nenhum lançamento neste período.
              </Typography>
            )}
            {data.data.latestTransactions.map((t) => (
              <Stack
                key={t.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                gap={1}
                sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
              >
                <Box>
                  <Typography>{t.description}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.date.slice(0, 10)} ·{' '}
                    {t.kind === 'INCOME' ? 'Receita' : 'Despesa'}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography
                    fontWeight={700}
                    color={t.kind === 'INCOME' ? 'success.main' : 'error.main'}
                  >
                    {t.currency ? money(t.amount, t.currency) : t.amount}
                  </Typography>
                  <Button
                    component={Link}
                    to={`/finance?tab=${t.kind === 'INCOME' ? 'incomes' : 'expenses'}&record=${t.id}`}
                  >
                    Abrir
                  </Button>
                </Stack>
              </Stack>
            ))}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
