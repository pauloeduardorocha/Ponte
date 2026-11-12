import { t as translate, getLocale, useLocale } from '../../i18n';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useAuth } from '../../auth/auth-context';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CircularProgress,
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Stack,
  TablePagination,
} from '@mui/material';
import { MetricCard, BreakdownChart } from '../../components/DataPresentation';
import { QueryError } from '../../components/PageParts';
import * as api from '../../lib/library-api';
export function LibraryDashboardPanel() {
  useLocale();
  const { hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const dashboard = useQuery({
    queryKey: ['library', 'dashboard', page, pageSize],
    queryFn: () => api.getLibraryDashboard({ page, pageSize }),
  });
  if (dashboard.isPending)
    return (
      <CircularProgress
        aria-label={translate('Carregando painel da biblioteca')}
      />
    );
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
      <Typography variant="h5">
        {translate('Biblioteca — visão geral')}
      </Typography>
      <Box className="metric-grid">
        {[
          {
            label: translate('Livros'),
            value: d.totalBooks,
            href: hasPermission('LIBRARY_BOOK_READ')
              ? '/library?tab=catalog'
              : undefined,
            color: 'primary.main',
          },
          {
            label: translate('Exemplares'),
            value: d.totalCopies,
            href: hasPermission('LIBRARY_COPY_READ')
              ? '/library?tab=copies'
              : undefined,
            color: 'info.main',
          },
          {
            label: translate('Empréstimos'),
            value: d.loaned,
            href: hasPermission('LIBRARY_LOAN_READ')
              ? '/library?tab=loans&status=ACTIVE'
              : undefined,
            color: 'info.main',
          },
          {
            label: translate('Atrasos'),
            value: d.overdue,
            href: hasPermission('LIBRARY_LOAN_READ')
              ? '/library?tab=loans&status=OVERDUE'
              : undefined,
            color: 'error.main',
          },
          {
            label: translate('Multas pendentes'),
            value: new Intl.NumberFormat(getLocale(), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Number(d.pendingFines)),
            detail: translate('Valor em aberto'),
            href: hasPermission('LIBRARY_FINE_READ')
              ? '/library?tab=fines'
              : undefined,
            color: 'warning.main',
          },
        ].map((i) => (
          <MetricCard key={i.label} {...i} />
        ))}
      </Box>
      <Box className="dashboard-panels">
        <BreakdownChart
          title={translate('Circulação do acervo')}
          items={[
            {
              label: translate('Disponíveis'),
              value: d.available,
              color: 'success.main',
            },
            {
              label: translate('Emprestados em dia'),
              value: Math.max(0, d.loaned - d.overdue),
              color: 'info.main',
            },
            {
              label: translate('Em atraso'),
              value: d.overdue,
              color: 'error.main',
            },
          ]}
        />
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6">
              {translate('Mais emprestados')}
            </Typography>
            {!d.mostBorrowed.length && (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                {translate('Nenhum empréstimo registrado.')}
              </Typography>
            )}
            <RecordTable
              primaryLabel={translate('Livro')}
              label={translate('Mais emprestados')}
            >
              {d.mostBorrowed.map((book) => (
                <RecordRow
                  key={book.bookId}
                  primary={
                    <>
                      <Typography>{book.title}</Typography>
                    </>
                  }
                  actions={
                    <>
                      {hasPermission('LIBRARY_BOOK_READ') && (
                        <Button
                          component={Link}
                          to={`/library?tab=catalog&search=${encodeURIComponent(book.title)}`}
                        >
                          {translate('Ver livro')}
                        </Button>
                      )}
                    </>
                  }
                >
                  <Typography>
                    {book.count} {translate(' empréstimos')}
                  </Typography>
                </RecordRow>
              ))}
            </RecordTable>
            <TablePagination
              component="div"
              count={d.totalMostBorrowed ?? d.mostBorrowed.length}
              page={page - 1}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              onPageChange={(_, next) => setPage(next + 1)}
              labelRowsPerPage={translate('Por página')}
              getItemAriaLabel={(type) =>
                type === 'next'
                  ? translate('Próxima página dos mais emprestados')
                  : translate('Página anterior dos mais emprestados')
              }
            />
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
