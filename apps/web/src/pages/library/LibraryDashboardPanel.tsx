import { useAuth } from '../../auth/auth-context';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CircularProgress,
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Stack,
} from '@mui/material';
import { MetricCard, BreakdownChart } from '../../components/DataPresentation';
import { QueryError } from '../../components/PageParts';
import * as api from '../../lib/library-api';
export function LibraryDashboardPanel() {
  const { hasPermission } = useAuth();
  const dashboard = useQuery({
    queryKey: ['library', 'dashboard'],
    queryFn: api.getLibraryDashboard,
    staleTime: 30000,
  });
  if (dashboard.isPending)
    return <CircularProgress aria-label="Carregando painel da biblioteca" />;
  if (dashboard.isError)
    return (
      <QueryError
        error={dashboard.error}
        onRetry={() => void dashboard.refetch()}
      />
    );
  const d = dashboard.data;
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Biblioteca — visão geral</Typography>
      <Box className="metric-grid">
        {[
          {
            label: 'Livros',
            value: d.totalBooks,
            href: hasPermission('LIBRARY_BOOK_READ')
              ? '/library?tab=catalog'
              : undefined,
            color: 'primary.main',
          },
          {
            label: 'Exemplares',
            value: d.totalCopies,
            href: hasPermission('LIBRARY_COPY_READ')
              ? '/library?tab=copies'
              : undefined,
            color: 'info.main',
          },
          {
            label: 'Empréstimos',
            value: d.loaned,
            href: hasPermission('LIBRARY_LOAN_READ')
              ? '/library?tab=loans&status=ACTIVE'
              : undefined,
            color: 'info.main',
          },
          {
            label: 'Atrasos',
            value: d.overdue,
            href: hasPermission('LIBRARY_LOAN_READ')
              ? '/library?tab=loans&status=OVERDUE'
              : undefined,
            color: 'error.main',
          },
          {
            label: 'Multas pendentes',
            value: new Intl.NumberFormat('pt-PT', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(d.pendingFines)),
            detail: 'Valor em aberto',
            href: hasPermission('LIBRARY_FINE_READ')
              ? '/library?tab=fines'
              : undefined,
            color: 'warning.dark',
          },
        ].map((i) => (
          <MetricCard key={i.label} {...i} />
        ))}
      </Box>
      <Box className="dashboard-panels">
        <BreakdownChart
          title="Circulação do acervo"
          items={[
            { label: 'Disponíveis', value: d.available, color: '#24754c' },
            {
              label: 'Emprestados em dia',
              value: Math.max(0, d.loaned - d.overdue),
              color: '#2863a4',
            },
            { label: 'Em atraso', value: d.overdue, color: '#ba3646' },
          ]}
        />
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">Mais emprestados</Typography>
            {!d.mostBorrowed.length && (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                Nenhum empréstimo registrado.
              </Typography>
            )}
            {d.mostBorrowed.map((book) => (
              <Stack
                key={book.bookId}
                direction="row"
                justifyContent="space-between"
                gap={1}
                sx={{ my: 1 }}
              >
                <Typography>
                  {book.title} — {book.count}
                </Typography>
                {hasPermission('LIBRARY_BOOK_READ') && (
                  <Button
                    component={Link}
                    to={`/library?tab=catalog&search=${encodeURIComponent(book.title)}`}
                  >
                    Ver livro
                  </Button>
                )}
              </Stack>
            ))}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
