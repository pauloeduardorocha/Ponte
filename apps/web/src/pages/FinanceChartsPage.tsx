import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';

type Slice = { name: string; amount: number };
type Point = {
  date: string;
  projected: boolean;
  income: number;
  expenses: number;
  balance: number;
};
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
const colors = [
  '#1565c0',
  '#c62828',
  '#00897b',
  '#7b1fa2',
  '#ef6c00',
  '#546e7a',
];
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
    amount,
  );

function Pie({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: Slice[];
  currency: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let offset = 0;
  const gradient = rows
    .map((row, i) => {
      const start = offset;
      offset += total ? (row.amount / total) * 100 : 0;
      return `${colors[i % colors.length]} ${start}% ${offset}%`;
    })
    .join(',');
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h3">
        {title}
      </Typography>
      {total > 0 ? (
        <Stack spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <Box
            role="img"
            aria-label={`${title}: ${rows.map((r) => `${r.name}: ${money(r.amount, currency)}`).join(', ')}`}
            sx={{
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: `conic-gradient(${gradient})`,
            }}
          />
          <Stack spacing={1} width="100%">
            {rows.map((r, i) => (
              <Typography key={r.name} variant="body2">
                <Box component="span" sx={{ color: colors[i % colors.length] }}>
                  ●{' '}
                </Box>
                {r.name}: {money(r.amount, currency)} (
                {((r.amount / total) * 100).toFixed(1)}%)
              </Typography>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Typography color="text.secondary">
          Sem movimentos no período.
        </Typography>
      )}
    </Card>
  );
}

function Timeline({ points, currency }: { points: Point[]; currency: string }) {
  const values = points.flatMap((p) => [p.balance, p.income, p.expenses]);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const x = (i: number) => 100 + (i / Math.max(1, points.length - 1)) * 680;
  const y = (v: number) => 250 - ((v - min) / (max - min)) * 220;
  const series = [
    ['balance', 'Saldo', colors[0]],
    ['income', 'Receitas', colors[2]],
    ['expenses', 'Despesas', colors[1]],
  ] as const;
  const firstProjection = points.findIndex((p) => p.projected);
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h3">
        Saldo bancário, receitas e despesas — {currency}
      </Typography>
      <Typography variant="body2">
        Linhas contínuas: realizado. Linhas tracejadas: projeção. Receitas e
        despesas diárias.
      </Typography>
      <Box
        component="svg"
        role="img"
        aria-label={`Evolução do saldo, receitas e despesas em ${currency}`}
        viewBox="0 0 800 290"
        sx={{ width: '100%', display: 'block' }}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="100"
              x2="780"
              y1={y(min + f * (max - min))}
              y2={y(min + f * (max - min))}
              stroke="currentColor"
              opacity="0.15"
            />
            <text
              x="92"
              y={y(min + f * (max - min)) + 4}
              textAnchor="end"
              fill="currentColor"
              fontSize="11"
            >
              {money(min + f * (max - min), currency)}
            </text>
          </g>
        ))}
        {series.map(([key, label, color]) => (
          <g key={key}>
            {[false, true].map((projected) => (
              <polyline
                key={String(projected)}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray={projected ? '6 4' : undefined}
                points={points
                  .flatMap((p, i) =>
                    (
                      projected
                        ? p.projected ||
                          (i === firstProjection - 1 && firstProjection > 0)
                        : !p.projected
                    )
                      ? [`${x(i)},${y(p[key])}`]
                      : [],
                  )
                  .join(' ')}
              />
            ))}
            {points.length === 1 ? (
              <circle cx={x(0)} cy={y(points[0]![key])} r="4" fill={color} />
            ) : null}
            <text
              x={100 + series.findIndex((s) => s[0] === key) * 220}
              y="15"
              fill={color}
              fontSize="12"
            >
              {label}
            </text>
          </g>
        ))}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) =>
            points[i] ? (
              <text
                key={i}
                x={x(i)}
                y="277"
                textAnchor="middle"
                fill="currentColor"
                fontSize="11"
              >
                {points[i].date}
              </text>
            ) : null,
          )}
      </Box>
      <Box component="details">
        <summary>Ver valores diários</summary>
        <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Saldo</th>
                <th>Receitas</th>
                <th>Despesas</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{money(p.balance, currency)}</td>
                  <td>{money(p.income, currency)}</td>
                  <td>{money(p.expenses, currency)}</td>
                  <td>{p.projected ? 'Projeção' : 'Realizado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Box>
    </Card>
  );
}

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
