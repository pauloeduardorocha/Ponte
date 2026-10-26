import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
  Tooltip,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { STATUS_LABELS } from '../lib/status-labels';

export function StatusChip({ status }: { status: string }) {
  const color = [
    'ACTIVE',
    'AVAILABLE',
    'COMPLETED',
    'PAID',
    'RECONCILED',
    'CONTACTED',
    'FULFILLED',
    'RETURNED',
    'CONFIRMED',
    'PRESENT',
    'INTEGRATED',
    'SENT',
  ].includes(status)
    ? 'success'
    : ['OVERDUE', 'LOST', 'DISABLED', 'FAILED', 'ABSENT', 'DECLINED'].includes(
          status,
        )
      ? 'error'
      : [
            'PENDING',
            'OPEN',
            'WAITING',
            'RESERVED',
            'POSSIBLE_DUPLICATE',
            'PENDING_REVIEW',
            'NEW',
            'READY_FOR_REVIEW',
            'EXPIRED',
            'INVITED',
            'EXCUSED',
          ].includes(status)
        ? 'warning'
        : [
              'CLASSIFIED',
              'IN_PROGRESS',
              'IN_FOLLOW_UP',
              'INTEGRATING',
              'PUBLISHED',
              'UPLOADED',
              'PROCESSING',
              'LOANED',
              'READY',
              'SCHEDULED',
              'TITHE',
              'OFFERING',
              'DONATION',
            ].includes(status)
          ? 'info'
          : 'default';
  return (
    <Chip
      size="small"
      label={STATUS_LABELS[status] ?? status}
      color={color}
      variant="outlined"
    />
  );
}
export function MetricCard({
  label,
  value,
  detail,
  color = 'primary.main',
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
  href?: string;
}) {
  const content = (
    <CardContent>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{
          my: 1,
          fontWeight: 750,
          fontVariantNumeric: 'tabular-nums',
          color,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      )}
    </CardContent>
  );
  return href ? (
    <Card
      component={Link}
      to={href}
      variant="outlined"
      sx={{
        textDecoration: 'none',
        borderTop: 3,
        borderTopColor: color,
        '&:hover': { bgcolor: 'action.hover' },
        height: '100%',
      }}
      aria-label={`${label}: ${value}. Abrir lista`}
    >
      {content}
    </Card>
  ) : (
    <Card
      variant="outlined"
      sx={{ borderTop: 3, borderTopColor: color, height: '100%' }}
    >
      {content}
    </Card>
  );
}
export function BreakdownChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; color: string }[];
}) {
  const maximum = Math.max(1, ...items.map((i) => i.value));
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Stack spacing={2}>
          {items.map((i) => (
            <Box key={i.label}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">{i.label}</Typography>
                <Typography variant="body2" fontWeight={700}>
                  {i.value.toLocaleString('pt-PT')}
                </Typography>
              </Stack>
              <LinearProgress
                aria-label={`${i.label}: ${i.value}`}
                variant="determinate"
                value={(100 * i.value) / maximum}
                sx={{
                  mt: 0.5,
                  height: 10,
                  borderRadius: 4,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: i.color,
                    borderRadius: 4,
                  },
                }}
              />
            </Box>
          ))}
        </Stack>
        {items.every((i) => i.value === 0) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Sem dados para apresentar.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
function categoryColor(id: string, kind: 'income' | 'expenses') {
  const hash = Array.from(id).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    0,
  );
  return `hsl(${kind === 'income' ? 135 + (hash % 40) : hash % 30}, ${50 + (hash % 25)}%, ${30 + ((hash >>> 8) % 30)}%)`;
}

export function MoneyTrend({
  rows,
  currency,
}: {
  rows: {
    month: string;
    income: string;
    expenses: string;
    incomeCategories?: { id: string; name: string; amount: string }[];
    expenseCategories?: { id: string; name: string; amount: string }[];
  }[];
  currency: string;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [Number(r.income), Number(r.expenses)]),
  );
  const format = (v: string) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(
      Number(v),
    );
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6">Evolução mensal · {currency}</Typography>
        <Typography variant="caption" color="text.secondary">
          Lançamentos concluídos, pela data do movimento
        </Typography>
        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
          <Chip label="Receitas" color="success" size="small" />
          <Chip label="Despesas" color="error" size="small" />
        </Stack>
        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          gap={1}
          sx={{ mb: 2 }}
        >
          {(['income', 'expenses'] as const).flatMap((kind) => {
            const categories = new Map(
              rows
                .flatMap(
                  (row) =>
                    (kind === 'income'
                      ? row.incomeCategories
                      : row.expenseCategories) ?? [],
                )
                .map((category) => [category.id, category]),
            );
            return Array.from(categories.values()).map((category) => (
              <Stack
                key={`${kind}-${category.id}`}
                direction="row"
                alignItems="center"
                gap={0.5}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    bgcolor: categoryColor(category.id, kind),
                    borderRadius: 0.5,
                  }}
                />
                <Typography variant="caption">
                  {category.name}
                </Typography>
              </Stack>
            ));
          })}
        </Stack>
        <Box
          sx={{
            height: 210,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(rows.length, 1)},minmax(0,1fr))`,
            gap: 1,
          }}
        >
          {rows.map((r) => (
            <Stack key={r.month} sx={{ minWidth: 0 }} justifyContent="flex-end">
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'end',
                  justifyContent: 'center',
                  gap: 0.5,
                  height: 160,
                }}
              >
                {(['income', 'expenses'] as const).map((kind) => {
                  const label = kind === 'income' ? 'Receitas' : 'Despesas';
                  const categories = (kind === 'income'
                    ? r.incomeCategories
                    : r.expenseCategories) ?? [
                    { id: 'total', name: label, amount: r[kind] },
                  ];
                  return (
                    <Tooltip
                      key={kind}
                      disableHoverListener={categories.some(
                        (category) => Number(category.amount) > 0,
                      )}
                      disableFocusListener={categories.some(
                        (category) => Number(category.amount) > 0,
                      )}
                      disableTouchListener={categories.some(
                        (category) => Number(category.amount) > 0,
                      )}
                      title={`${label}: ${format(r[kind])}`}
                      arrow
                    >
                      <Box
                        tabIndex={0}
                        aria-label={`${r.month}, ${label}: ${format(r[kind])}`}
                        sx={{
                          width: '30%',
                          height: `${(100 * Number(r[kind])) / max}%`,
                          minHeight: 2,
                          display: 'flex',
                          flexDirection: 'column-reverse',
                          borderRadius: '5px 5px 0 0',
                          bgcolor:
                            kind === 'income' ? 'success.main' : 'error.main',
                        }}
                      >
                        {categories
                          .filter((category) => Number(category.amount) > 0)
                          .map((category) => (
                            <Tooltip
                              key={category.id}
                              arrow
                              title={`${category.name}: ${format(category.amount)} · Total: ${format(r[kind])}`}
                            >
                              <Box
                                tabIndex={0}
                                aria-label={`${r.month}, ${label}, ${category.name}: ${format(category.amount)}`}
                                sx={{
                                  height: `${(100 * Number(category.amount)) / Number(r[kind])}%`,
                                  flexShrink: 0,
                                  bgcolor: categoryColor(category.id, kind),
                                  '&:hover, &:focus-visible': {
                                    filter: 'brightness(1.2)',
                                    outline: '2px solid',
                                    outlineColor: 'text.primary',
                                    zIndex: 1,
                                  },
                                }}
                              />
                            </Tooltip>
                          ))}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
              <Typography variant="caption" textAlign="center" sx={{ mt: 1 }}>
                {r.month.slice(5)}/{r.month.slice(2, 4)}
              </Typography>
            </Stack>
          ))}
        </Box>
        <Box component="details" sx={{ mt: 1 }}>
          <Box component="summary" sx={{ cursor: 'pointer', fontSize: 14 }}>
            Ver valores do gráfico
          </Box>
          {rows.map((r) => (
            <Typography key={r.month} variant="body2">
              {r.month} · Receitas {format(r.income)} · Despesas{' '}
              {format(r.expenses)}
              {[
                ...(r.incomeCategories ?? []),
                ...(r.expenseCategories ?? []),
              ].map((category) => (
                <Box
                  component="span"
                  key={category.id}
                  sx={{ display: 'block', pl: 2 }}
                >
                  {category.name}: {format(category.amount)}
                </Box>
              ))}
            </Typography>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
