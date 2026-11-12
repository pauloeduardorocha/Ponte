import { t as translate, useLocale } from '../../i18n';
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
  useLocale();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const history = useQuery({
    queryKey: ['library', 'fine-history', fineId, page, pageSize],
    queryFn: () => getFineHistory(fineId, { page, pageSize }),
    enabled: open,
  });
  return (
    <Stack spacing={1}>
      <Button onClick={() => setOpen(!open)} aria-expanded={open}>
        {open
          ? translate('Ocultar pagamentos e ajustes')
          : translate('Ver pagamentos e ajustes')}
      </Button>
      {open && history.isPending && (
        <CircularProgress
          aria-label={translate('Carregando movimentos da multa')}
        />
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
              {translate('Pagamento ')}
              {payment.amount} · {formatDate(payment.createdAt)} ·{' '}
              {payment.createdBy}
            </Typography>
          ))}
          {history.data.adjustments.map((adjustment) => (
            <Typography key={adjustment.id} variant="body2">
              {translate(
                {
                  DISCOUNT: 'Desconto',
                  FORGIVE: 'Perdoado',
                  CANCEL: 'Cancelado',
                }[adjustment.kind] ?? adjustment.kind,
              )}{' '}
              {adjustment.amount} · {adjustment.justification} ·{' '}
              {formatDate(adjustment.createdAt)} · {adjustment.createdBy}
            </Typography>
          ))}
          {!history.data.totalPayments && !history.data.totalAdjustments && (
            <Alert severity="info">
              {translate('Nenhum pagamento ou ajuste.')}
            </Alert>
          )}
          <TablePagination
            component="div"
            count={Math.max(
              history.data.totalPayments,
              history.data.totalAdjustments,
            )}
            page={page - 1}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[10, 20, 50, 100]}
            onRowsPerPageChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            onPageChange={(_, next) => setPage(next + 1)}
            labelRowsPerPage={translate('Por página em cada lista')}
            labelDisplayedRows={() => translate('Página {0}', [page])}
            getItemAriaLabel={(type) =>
              type === 'next'
                ? translate('Próxima página dos movimentos')
                : translate('Página anterior dos movimentos')
            }
          />
        </>
      )}
    </Stack>
  );
}
