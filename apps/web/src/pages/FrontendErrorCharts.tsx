import type { FrontendErrorStat, FrontendErrorStats } from '@church/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';

const colors = [
  '#1976d2',
  '#d84315',
  '#7b1fa2',
  '#00897b',
  '#c2185b',
  '#546e7a',
  '#827717',
  '#5d4037',
];
const typeLabels: Record<string, string> = {
  api: 'API',
  runtime: 'Execução JavaScript',
  unhandled_rejection: 'Rejeição não tratada',
  console: 'Console',
};
const number = (value: number) => value.toLocaleString('pt-PT');

function Ranking({
  title,
  rows,
}: {
  title: string;
  rows: FrontendErrorStat[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <Card variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Stack spacing={1.5}>
        {rows.map((row) => (
          <Box key={row.label}>
            <Stack direction="row" justifyContent="space-between" gap={2}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {row.label}
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {number(row.count)}
              </Typography>
            </Stack>
            <Box
              aria-hidden="true"
              sx={{
                mt: 0.5,
                height: 5,
                bgcolor: 'action.hover',
                borderRadius: 1,
              }}
            >
              <Box
                sx={{
                  width: `${(row.count / max) * 100}%`,
                  height: '100%',
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                }}
              />
            </Box>
          </Box>
        ))}
        {rows.length === 0 && (
          <Typography color="text.secondary">Sem ocorrências.</Typography>
        )}
      </Stack>
    </Card>
  );
}

export function FrontendErrorCharts() {
  const stats = useQuery({
    queryKey: ['frontend-error-stats'],
    queryFn: () =>
      apiRequest<FrontendErrorStats>('/audit/frontend-errors/stats'),
  });
  if (stats.isPending)
    return <LinearProgress aria-label="Carregando estatísticas dos erros" />;
  if (stats.isError)
    return (
      <Alert severity="warning">
        Não foi possível carregar os gráficos. A lista de erros continua
        disponível.
      </Alert>
    );
  const rows = stats.data.rows;
  const metric = (label: string) =>
    rows.find((row) => row.kind === 'metrics' && row.label === label)?.count ??
    0;
  const total = metric('total');
  const types = rows.filter((row) => row.kind === 'types');
  const timeline = rows
    .filter((row) => row.kind === 'timeline')
    .sort((a, b) => a.label.localeCompare(b.label));
  const peak = Math.max(2, ...timeline.map((row) => row.count));
  let offset = 0;
  const slices = types.map((row, i) => {
    const start = offset;
    offset += total ? (row.count / total) * 100 : 0;
    return `${colors[i % colors.length]} ${start}% ${offset}%`;
  });
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Resumo dos últimos 30 dias de calendário (UTC), incluindo hoje. Os
        gráficos consideram todas as páginas.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
        }}
      >
        {[
          ['Total de erros', total],
          ['Erros hoje (UTC)', metric('today')],
          ['Utilizadores identificados', metric('users')],
          ['Falhas HTTP 5xx', metric('serverErrors')],
        ].map(([label, value]) => (
          <Card variant="outlined" key={label} sx={{ p: 2 }}>
            <Typography color="text.secondary" variant="body2">
              {label}
            </Typography>
            <Typography variant="h4" component="p">
              {number(Number(value))}
            </Typography>
          </Card>
        ))}
      </Box>
      {total === 0 ? (
        <Alert severity="info">Nenhum erro registrado no período.</Alert>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' },
          gap: 2,
        }}
      >
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Tipos de erro
          </Typography>
          <Stack spacing={2} alignItems="center">
            <Box
              role="img"
              aria-label={`Gráfico de pizza por tipo de erro: ${types.map((row) => `${typeLabels[row.label] ?? row.label}: ${row.count}`).join(', ') || 'sem ocorrências'}`}
              sx={{
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: total
                  ? `conic-gradient(${slices.join(',')})`
                  : undefined,
                bgcolor: 'action.hover',
              }}
            />
            <Stack spacing={1} sx={{ width: '100%' }}>
              {types.map((row, i) => (
                <Stack
                  key={row.label}
                  direction="row"
                  alignItems="center"
                  gap={1}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 12,
                      height: 12,
                      flexShrink: 0,
                      bgcolor: colors[i % colors.length],
                      borderRadius: 0.5,
                    }}
                  />
                  <Typography variant="body2">
                    {typeLabels[row.label] ?? row.label}: {number(row.count)} (
                    {total ? ((row.count / total) * 100).toFixed(1) : '0'}%)
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Card>
        <Card variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="h6" component="h2">
            Evolução diária dos erros
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Data de recebimento (UTC). Passe sobre as barras para ver os
            valores.
          </Typography>
          <Box
            component="svg"
            role="img"
            aria-label="Timeline de erros por dia"
            viewBox="0 0 660 230"
            sx={{ width: '100%', display: 'block', color: 'primary.main' }}
          >
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1="40"
                  x2="650"
                  y1={190 - fraction * 160}
                  y2={190 - fraction * 160}
                  stroke="currentColor"
                  opacity="0.15"
                />
                <text
                  x="32"
                  y={194 - fraction * 160}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize="12"
                >
                  {Math.round(peak * fraction)}
                </text>
              </g>
            ))}
            {timeline.map((row, i) => {
              const width = 600 / Math.max(1, timeline.length);
              return (
                <g key={row.label}>
                  <rect
                    x={45 + i * width}
                    y={190 - (row.count / peak) * 160}
                    width={Math.max(1, width - 3)}
                    height={(row.count / peak) * 160}
                    fill="currentColor"
                  >
                    <title>
                      {row.label}: {number(row.count)} erros
                    </title>
                  </rect>
                  {i % 7 === 0 || i === timeline.length - 1 ? (
                    <text
                      x={45 + i * width + width / 2}
                      y="214"
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize="11"
                    >
                      {row.label.slice(8)}/{row.label.slice(5, 7)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </Box>
          <Box component="details">
            <Box component="summary" sx={{ cursor: 'pointer' }}>
              Ver valores diários
            </Box>
            <Box component="ul" sx={{ maxHeight: 160, overflowY: 'auto' }}>
              {timeline.map((row) => (
                <li key={row.label}>
                  {row.label}: {number(row.count)} erros
                </li>
              ))}
            </Box>
          </Box>
        </Card>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Distribuições abaixo: até 8 itens mais frequentes por categoria.
        Utilizadores sem sessão válida não entram na contagem de utilizadores
        identificados.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
        }}
      >
        {[
          ['http', 'Status HTTP'],
          ['routes', 'Rotas com mais erros'],
          ['versions', 'Versões da aplicação'],
          ['browsers', 'Navegadores'],
          ['systems', 'Sistemas operativos'],
        ].map(([kind, title]) => (
          <Ranking
            key={kind}
            title={title!}
            rows={rows.filter((row) => row.kind === kind)}
          />
        ))}
      </Box>
    </Stack>
  );
}
