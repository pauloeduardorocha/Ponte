import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import {
  Brush,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type FinanceSlice = { name: string; amount: number };
export type FinancePoint = {
  date: string;
  projected: boolean;
  income: number;
  expenses: number;
  balance: number;
};
const colors = [
  '#1565c0',
  '#c62828',
  '#00897b',
  '#7b1fa2',
  '#ef6c00',
  '#546e7a',
];
const series = [
  { key: 'balance', label: 'Saldo', color: colors[0] },
  { key: 'income', label: 'Receitas', color: colors[2] },
  { key: 'expenses', label: 'Despesas', color: colors[1] },
] as const;
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function FinancePieChart({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: FinanceSlice[];
  currency: string;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Card variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography variant="h6" component="h3">
        {title}
      </Typography>
      {total > 0 ? (
        <>
          <Box
            role="img"
            aria-label={`${title}: ${rows.map((r) => `${r.name}: ${money(r.amount, currency)}`).join(', ')}`}
            sx={{ height: 280, width: '100%' }}
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 500, height: 280 }}
            >
              <PieChart accessibilityLayer>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="85%"
                  paddingAngle={rows.length > 1 ? 2 : 0}
                  isAnimationActive={!reducedMotion}
                  animationDuration={650}
                >
                  {rows.map((row, i) => (
                    <Cell
                      key={row.name}
                      fill={colors[i % colors.length]}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) =>
                    `${money(Number(value), currency)} (${((Number(value) / total) * 100).toFixed(1)}%)`
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <Stack spacing={1}>
            {rows.map((row, i) => (
              <Typography key={row.name} variant="body2">
                <Box component="span" sx={{ color: colors[i % colors.length] }}>
                  ●{' '}
                </Box>
                {row.name}: {money(row.amount, currency)} (
                {((row.amount / total) * 100).toFixed(1)}%)
              </Typography>
            ))}
          </Stack>
        </>
      ) : (
        <Typography color="text.secondary">
          Sem movimentos no período.
        </Typography>
      )}
    </Card>
  );
}

export function FinanceTimelineChart({
  points,
  currency,
}: {
  points: FinancePoint[];
  currency: string;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [hidden, setHidden] = useState<string[]>([]);
  const firstProjection = points.findIndex((p) => p.projected);
  const data = points.map((point, i) => ({
    ...point,
    ...Object.fromEntries(
      series.flatMap(({ key }) => [
        [`${key}Actual`, point.projected ? null : point[key]],
        [
          `${key}Projected`,
          point.projected || (firstProjection > 0 && i === firstProjection - 1)
            ? point[key]
            : null,
        ],
      ]),
    ),
  }));
  return (
    <Card variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography variant="h6" component="h3">
        Saldo bancário, receitas e despesas — {currency}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Linhas contínuas: realizado. Tracejadas: projeção. Passe sobre o gráfico
        para ver os valores diários; use a faixa inferior para ampliar um
        período.
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        sx={{ my: 2 }}
        aria-label="Séries do gráfico"
      >
        {series.map(({ key, label, color }) => (
          <Button
            key={key}
            size="small"
            variant={hidden.includes(key) ? 'outlined' : 'contained'}
            aria-pressed={!hidden.includes(key)}
            aria-label={`${hidden.includes(key) ? 'Mostrar' : 'Ocultar'} ${label}`}
            onClick={() =>
              setHidden((current) =>
                current.includes(key)
                  ? current.filter((item) => item !== key)
                  : [...current, key],
              )
            }
            sx={{ bgcolor: hidden.includes(key) ? undefined : color }}
          >
            {label}
          </Button>
        ))}
      </Stack>
      <Box
        role="region"
        aria-label={`Evolução do saldo, receitas e despesas em ${currency}`}
        sx={{ height: 380, width: '100%' }}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 900, height: 380 }}
        >
          <LineChart
            data={data}
            accessibilityLayer
            margin={{ top: 16, right: 20, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => dateLabel(value)}
              minTickGap={45}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              width={85}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat('pt-PT', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(value)
              }
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={({ active, label }) => {
                const point = points.find((p) => p.date === String(label));
                return active && point ? (
                  <Card variant="outlined" sx={{ p: 1.5 }} role="status">
                    <Typography fontWeight={700}>
                      {dateLabel(point.date)} ·{' '}
                      {point.projected ? 'Projeção' : 'Realizado'}
                    </Typography>
                    {series
                      .filter(({ key }) => !hidden.includes(key))
                      .map(({ key, label: name, color }) => (
                        <Typography key={key} variant="body2" sx={{ color }}>
                          {name}: {money(point[key], currency)}
                        </Typography>
                      ))}
                  </Card>
                ) : null;
              }}
            />
            {series.flatMap(({ key, label, color }) => [
              <Line
                key={`${key}Actual`}
                dataKey={`${key}Actual`}
                name={label}
                stroke={color}
                strokeWidth={2.5}
                dot={points.length === 1}
                activeDot={{ r: 6 }}
                hide={hidden.includes(key)}
                isAnimationActive={!reducedMotion}
                animationDuration={650}
              />,
              <Line
                key={`${key}Projected`}
                dataKey={`${key}Projected`}
                name={`${label} (projeção)`}
                stroke={color}
                strokeWidth={2.5}
                strokeDasharray="7 5"
                dot={false}
                activeDot={{ r: 6 }}
                hide={hidden.includes(key)}
                isAnimationActive={!reducedMotion}
                animationDuration={650}
              />,
            ])}
            {points.length > 1 ? (
              <Brush
                dataKey="date"
                height={26}
                travellerWidth={10}
                tickFormatter={(value: string) => dateLabel(value)}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
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
                  <td>{dateLabel(p.date)}</td>
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
