import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';

import {
  FinancePieChart as Pie,
  FinanceTimelineChart as Timeline,
  type FinanceSlice as Slice,
  type FinancePoint as Point,
} from './FinanceInteractiveCharts';

export type FinanceCharts = {
  through: string;
  currencies: {
    currency: string;
    averageIncome: number;
    averageExpenses: number;
    historicalDays: number;
    incomeCategories: Slice[];
    expenseCategories: Slice[];
    incomeCenters: Slice[];
    expenseCenters: Slice[];
    points: Point[];
  }[];
};
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
    amount,
  );

function FilteredTimeline({
  start,
  end,
  currency,
}: {
  start: string;
  end: string;
  currency: string;
}) {
  const [lineEnd, setLineEnd] = useState(end);
  const today = new Date().toISOString().slice(0, 10);
  const valid = Boolean(
    lineEnd &&
    lineEnd >= start &&
    (Date.parse(lineEnd) - Date.parse(start)) / 86400000 <= 1095,
  );
  const chart = useQuery({
    queryKey: ['finance', 'charts', start, lineEnd],
    queryFn: () =>
      apiRequest<FinanceCharts>('/finance/charts', {
        query: { start, end: lineEnd },
      }),
    enabled: valid,
  });
  const data = chart.data?.currencies.find((c) => c.currency === currency);
  return (
    <Stack spacing={2}>
      <TextField
        label={`Data fim do gráfico de linha (${currency})`}
        type="date"
        value={lineEnd}
        onChange={(e) => setLineEnd(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: start } }}
        sx={{ maxWidth: 340 }}
      />
      {!valid ? (
        <Alert severity="warning">
          Selecione fim após o início e intervalo de até 1095 dias.
        </Alert>
      ) : null}
      {valid && chart.isFetching ? (
        <LinearProgress aria-label="Carregando projeção" />
      ) : null}
      {valid && chart.isError ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void chart.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar a evolução do saldo.
        </Alert>
      ) : null}
      {valid && data ? (
        <>
          <Timeline points={data.points} currency={currency} />
          {lineEnd > today ? (
            <Typography variant="body2">
              Base da projeção: {data.historicalDays} dias. Média diária:
              receitas {money(data.averageIncome, currency)} e despesas{' '}
              {money(data.averageExpenses, currency)}. Estimativa sem garantia
              de realização.
            </Typography>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}

export function FinanceChartsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const valid = Boolean(
    start &&
    end &&
    start >= '2000-01-01' &&
    start <= today &&
    start <= end &&
    (Date.parse(end) - Date.parse(start)) / 86400000 <= 1095,
  );
  const charts = useQuery({
    queryKey: ['finance', 'charts', start, end],
    queryFn: () =>
      apiRequest<FinanceCharts>('/finance/charts', { query: { start, end } }),
    enabled: valid,
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Dashboard da tesouraria
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Data início"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: '2000-01-01', max: today },
          }}
        />
        <TextField
          label="Data fim"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: start },
          }}
        />
      </Stack>
      {!valid ? (
        <Alert severity="warning">
          Selecione início até hoje, fim após o início e intervalo de até 1095
          dias.
        </Alert>
      ) : null}
      <Alert severity="info">
        Selecione uma data fim futura para projetar o saldo. A estimativa usa as
        médias diárias de receitas e despesas concluídas entre a data início e
        hoje (UTC), incluindo dias sem movimentos. Não inclui compromissos
        pendentes. As pizzas mostram apenas valores realizados. O saldo inclui
        saldos iniciais e movimentos anteriores ao período.
      </Alert>
      {valid && charts.isFetching ? (
        <LinearProgress aria-label="Carregando gráficos" />
      ) : null}
      {valid && charts.isError ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void charts.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          Não foi possível carregar os gráficos.
        </Alert>
      ) : null}
      {valid && charts.data?.currencies.length === 0 ? (
        <Alert severity="info">Nenhuma conta bancária cadastrada.</Alert>
      ) : null}
      {valid
        ? charts.data?.currencies.map((c) => (
            <Stack key={c.currency} spacing={2}>
              <Typography variant="h6" component="h2">
                {c.currency}
              </Typography>
              <FilteredTimeline
                key={`${start}:${end}`}
                start={start}
                end={end}
                currency={c.currency}
              />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <Pie
                  title="Receitas por categoria"
                  rows={c.incomeCategories}
                  currency={c.currency}
                />
                <Pie
                  title="Despesas por categoria"
                  rows={c.expenseCategories}
                  currency={c.currency}
                />
                <Pie
                  title="Receitas por centro de custos"
                  rows={c.incomeCenters}
                  currency={c.currency}
                />
                <Pie
                  title="Despesas por centro de custos"
                  rows={c.expenseCenters}
                  currency={c.currency}
                />
              </Box>
            </Stack>
          ))
        : null}
    </Stack>
  );
}
