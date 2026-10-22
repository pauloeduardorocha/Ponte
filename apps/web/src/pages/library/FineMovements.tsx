import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  TablePagination,
  Typography,
} from '@mui/material';
import { getFineHistory } from '../../lib/library-api';
import { formatDate } from '../../lib/format';
import { QueryError } from '../../components/PageParts';

export function FineMovements({ fineId }: { fineId: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['library', 'fine-history', fineId, page],
    queryFn: () => getFineHistory(fineId, { page, pageSize: 20 }),
    enabled: open,
  });
  return (
    <Stack spacing={1}>
      <Button onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Ocultar pagamentos e ajustes' : 'Ver pagamentos e ajustes'}
      </Button>
      {open && history.isPending && (
        <CircularProgress aria-label="Carregando movimentos da multa" />
      )}
      {open && history.isError && (
        <QueryError
          error={history.error}
          onRetry={() => void history.refetch()}
        />
      )}
      {open && history.data && (
        <>
          {history.data.payments.map((payment) => (
            <Typography key={payment.id} variant="body2">
              Pagamento {payment.amount} · {formatDate(payment.createdAt)} ·{' '}
              {payment.createdBy}
            </Typography>
          ))}
          {history.data.adjustments.map((adjustment) => (
            <Typography key={adjustment.id} variant="body2">
              {adjustment.kind} {adjustment.amount} · {adjustment.justification}{' '}
              · {formatDate(adjustment.createdAt)} · {adjustment.createdBy}
            </Typography>
          ))}
          {!history.data.totalPayments && !history.data.totalAdjustments && (
            <Alert severity="info">Nenhum pagamento ou ajuste.</Alert>
          )}
          <TablePagination
            component="div"
            count={Math.max(
              history.data.totalPayments,
              history.data.totalAdjustments,
            )}
            page={page - 1}
            rowsPerPage={20}
            rowsPerPageOptions={[20]}
            onPageChange={(_, next) => setPage(next + 1)}
            labelRowsPerPage="Por página em cada lista"
            labelDisplayedRows={() => `Página ${page}`}
            getItemAriaLabel={(type) =>
              type === 'next'
                ? 'Próxima página dos movimentos'
                : 'Página anterior dos movimentos'
            }
          />
        </>
      )}
    </Stack>
  );
}
