import type {
  FrontendErrorSummary,
  FrontendErrorDetail,
  Page,
} from '@church/shared';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { FrontendErrorCharts } from './FrontendErrorCharts';
import { FrontendErrorDetailMap, FrontendErrorMap } from './FrontendErrorMap';

function ErrorUser({
  user,
  userId,
}: Pick<FrontendErrorSummary, 'user' | 'userId'>) {
  if (!user) return <>{userId ?? 'Não identificado'}</>;
  const name = user.name.trim() || user.id;
  return user.memberId ? (
    <Link
      component={RouterLink}
      to={`/members/${encodeURIComponent(user.memberId)}`}
    >
      {name}
    </Link>
  ) : (
    <>{name} (sem cadastro associado)</>
  );
}

export function FrontendErrorsPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string | null>(null);
  const errors = useQuery({
    queryKey: ['frontend-errors', page, pageSize],
    queryFn: () =>
      apiRequest<Page<FrontendErrorSummary>>('/audit/frontend-errors', {
        query: { page: page + 1, pageSize },
      }),
  });
  const detail = useQuery({
    queryKey: ['frontend-error', selected],
    queryFn: () =>
      apiRequest<FrontendErrorDetail>(`/audit/frontend-errors/${selected}`),
    enabled: !!selected,
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Erros de frontend</Typography>
      <Typography color="text.secondary">
        Ocorrências dos últimos 30 dias, da mais recente para a mais antiga.
      </Typography>
      <FrontendErrorCharts />
      <FrontendErrorMap onSelect={setSelected} />
      {errors.isError && (
        <Alert severity="error">
          Não foi possível carregar os erros de frontend.
        </Alert>
      )}
      {errors.isLoading && (
        <Typography role="status">Carregando erros—</Typography>
      )}
      <Card sx={{ overflowX: 'auto' }}>
        <Table aria-label="Erros de frontend">
          <TableHead>
            <TableRow>
              {[
                'Data da ocorrência',
                'Tipo',
                'Usuário',
                'Mensagem',
                'Rota',
                'Versão',
                'HTTP',
                'IP',
                'Localização aproximada',
                'Detalhes',
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {errors.data?.items.map((error) => (
              <TableRow key={error.id}>
                <TableCell>{formatDateTime(error.occurredAt)}</TableCell>
                <TableCell>{error.eventType}</TableCell>
                <TableCell>
                  <ErrorUser user={error.user} userId={error.userId} />
                </TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere', minWidth: 200 }}>
                  {error.message}
                </TableCell>
                <TableCell>{error.route}</TableCell>
                <TableCell>{error.device?.appVersion ?? '—'}</TableCell>
                <TableCell>{error.apiStatus ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {error.device?.network?.ipAddress ?? '—'}
                </TableCell>
                <TableCell>
                  {[
                    error.device?.network?.geo?.city,
                    error.device?.network?.geo?.region,
                    error.device?.network?.geo?.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </TableCell>
                <TableCell>
                  <Button onClick={() => setSelected(error.id)}>
                    Ver erro
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {errors.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={10}>Nenhum erro encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={errors.data?.total ?? 0}
          page={page}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, next) => setPage(next)}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
        />
      </Card>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Detalhes do erro de frontend</DialogTitle>
        <DialogContent>
          {detail.isLoading && (
            <Typography role="status">Carregando detalhes—</Typography>
          )}
          {detail.isError && (
            <Alert severity="error">
              Não foi possível carregar os detalhes do erro.
            </Alert>
          )}
          {detail.data && (
            <FrontendErrorDetailMap
              key={String(detail.data.id)}
              report={{ ...detail.data }}
            />
          )}
          {detail.data && (
            <Table aria-label="Detalhes do erro">
              <TableBody>
                {Object.entries(detail.data)
                  .filter(([key]) => key !== 'user')
                  .map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell component="th" scope="row">
                        {key === 'userId' ? 'Usuário' : key}
                      </TableCell>
                      <TableCell
                        sx={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {key === 'userId' ? (
                          <>
                            <ErrorUser
                              user={detail.data?.user ?? null}
                              userId={detail.data?.userId ?? null}
                            />
                            <Typography variant="caption" display="block">
                              {detail.data?.userId ?? '—'}
                            </Typography>
                          </>
                        ) : typeof value === 'object' && value !== null ? (
                          JSON.stringify(value, null, 2)
                        ) : (
                          String(value ?? '—')
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
