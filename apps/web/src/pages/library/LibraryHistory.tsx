import { STATUS_LABELS } from '../../lib/status-labels';
import { t as translate, useLocale } from '../../i18n';
import { FineMovements } from './FineMovements';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  CircularProgress,
  Stack,
  Typography,
  TablePagination,
} from '@mui/material';
import { useState } from 'react';
import {
  getMemberLibraryHistory,
  fineBalance,
  type LibraryHistory,
} from '../../lib/library-api';
import { QueryError } from '../../components/PageParts';
import { formatDate } from '../../lib/format';

export function HistoryContent({ history }: { history: LibraryHistory }) {
  useLocale();
  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        {translate('Empréstimos ativos / histórico / atrasos')}
      </Typography>
      {!history.loans.length && (
        <Alert severity="info">{translate('Nenhum empréstimo.')}</Alert>
      )}
      <RecordTable hasActions={false}>
        {history.loans.map((loan) => (
          <RecordRow
            key={loan.id}
            primary={
              <>
                <Typography fontWeight={600}>
                  {loan.bookCopy.book.title} — {loan.bookCopy.assetCode} —{' '}
                  {STATUS_LABELS[loan.status] ?? loan.status}
                </Typography>
              </>
            }
            hasActions={false}
            actions={<></>}
          >
            <Typography variant="body2">
              {loan.member.name} {translate(' · Emprestado: ')}
              {formatDate(loan.borrowedAt)} {translate(' · Vencimento: ')}
              {formatDate(loan.dueAt)} {translate(' · Devolução:')}{' '}
              {loan.returnedAt ? formatDate(loan.returnedAt) : '—'}{' '}
              {translate(' · Renovações: ')}
              {loan.renewedCount}
            </Typography>
            <Typography variant="body2">
              {translate('Operador: ')}
              {loan.createdBy} {translate(' · Recebido por:')}{' '}
              {loan.returnedBy ?? '—'} · {loan.observations}
            </Typography>
            {loan.fine && (
              <>
                <Typography>
                  {translate('Multa: ')}
                  {STATUS_LABELS[loan.fine.status] ?? loan.fine.status}{' '}
                  {translate(' · Total ')}
                  {loan.fine.amount} {translate(' · Pago')}{' '}
                  {loan.fine.paidAmount} {translate(' · Ajustado ')}
                  {loan.fine.discount} {translate(' · Saldo')}{' '}
                  {fineBalance(loan.fine)}
                </Typography>
                <FineMovements fineId={loan.fine.id} />
              </>
            )}
          </RecordRow>
        ))}
      </RecordTable>
      <Typography variant="h6">{translate('Reservas')}</Typography>
      {!history.reservations.length && (
        <Alert severity="info">{translate('Nenhuma reserva.')}</Alert>
      )}
      <RecordTable hasActions={false}>
        {history.reservations.map((reservation) => (
          <RecordRow
            key={reservation.id}
            hasActions={false}
            primary={<Typography>{reservation.book.title}</Typography>}
          >
            <Typography variant="body2">
              {reservation.member.name} ·{' '}
              {STATUS_LABELS[reservation.status] ?? reservation.status}{' '}
              {translate(' · Exemplar')}{' '}
              {reservation.bookCopy?.assetCode ?? translate('aguardando')}{' '}
              {translate(' · Expira')}{' '}
              {formatDate(reservation.holdUntil ?? reservation.expiresAt)}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Stack>
  );
}

export function MemberLibraryHistory({ memberId }: { memberId: string }) {
  useLocale();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const history = useQuery({
    queryKey: ['library', 'member-history', memberId, page, pageSize],
    queryFn: () => getMemberLibraryHistory(memberId, { page, pageSize }),
  });
  if (history.isPending)
    return <CircularProgress aria-label={translate('Carregando biblioteca')} />;
  if (history.isError)
    return (
      <QueryError
        error={history.error}
        onRetry={() => void history.refetch()}
      />
    );
  return (
    <Stack spacing={2}>
      <HistoryContent history={history.data} />
      <HistoryPagination
        history={history.data}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Stack>
  );
}

export function HistoryPagination({
  history,
  onPageChange,
  onPageSizeChange,
}: {
  history: LibraryHistory & { totalEvents?: number };
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  useLocale();
  return (
    <TablePagination
      component="div"
      count={Math.max(
        history.totalLoans,
        history.totalReservations,
        history.totalEvents ?? 0,
      )}
      page={history.page - 1}
      rowsPerPage={history.pageSize}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onRowsPerPageChange={(event) =>
        onPageSizeChange(Number(event.target.value))
      }
      onPageChange={(_, page) => onPageChange(page + 1)}
      labelRowsPerPage={translate('Por página em cada lista')}
      labelDisplayedRows={({ page }) => translate('Página {0}', [page + 1])}
      getItemAriaLabel={(type) =>
        type === 'next'
          ? translate('Próxima página do histórico')
          : translate('Página anterior do histórico')
      }
    />
  );
}
