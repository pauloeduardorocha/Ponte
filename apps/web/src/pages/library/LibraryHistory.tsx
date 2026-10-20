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
  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        Empréstimos ativos / histórico / atrasos
      </Typography>
      {!history.loans.length && (
        <Alert severity="info">Nenhum empréstimo.</Alert>
      )}
      <RecordTable hasActions={false}>
        {history.loans.map((loan) => (
          <RecordRow
            key={loan.id}
            primary={
              <>
                <Typography fontWeight={600}>
                  {loan.bookCopy.book.title} — {loan.bookCopy.assetCode} —{' '}
                  {loan.status}
                </Typography>
              </>
            }
            hasActions={false}
            actions={<></>}
          >
            <Typography variant="body2">
              {loan.member.name} · Emprestado: {formatDate(loan.borrowedAt)} ·
              Vencimento: {formatDate(loan.dueAt)} · Devolução:{' '}
              {loan.returnedAt ? formatDate(loan.returnedAt) : '—'} ·
              Renovações: {loan.renewedCount}
            </Typography>
            <Typography variant="body2">
              Operador: {loan.createdBy} · Recebido por:{' '}
              {loan.returnedBy ?? '—'} · {loan.observations}
            </Typography>
            {loan.fine && (
              <>
                <Typography>
                  Multa: {loan.fine.status} · Total {loan.fine.amount} · Pago{' '}
                  {loan.fine.paidAmount} · Ajustado {loan.fine.discount} · Saldo{' '}
                  {fineBalance(loan.fine)}
                </Typography>
                {loan.fine.payments.map((payment) => (
                  <Typography key={payment.id} variant="body2">
                    Pagamento {payment.amount} · {formatDate(payment.createdAt)}{' '}
                    · {payment.createdBy}
                  </Typography>
                ))}
                {loan.fine.adjustments.map((adjustment) => (
                  <Typography key={adjustment.id} variant="body2">
                    {adjustment.kind} {adjustment.amount} ·{' '}
                    {adjustment.justification} ·{' '}
                    {formatDate(adjustment.createdAt)} · {adjustment.createdBy}
                  </Typography>
                ))}
              </>
            )}
          </RecordRow>
        ))}
      </RecordTable>
      <Typography variant="h6">Reservas</Typography>
      {!history.reservations.length && (
        <Alert severity="info">Nenhuma reserva.</Alert>
      )}
      <RecordTable hasActions={false}>
        {history.reservations.map((reservation) => (
          <RecordRow
            key={reservation.id}
            hasActions={false}
            primary={<Typography>{reservation.book.title}</Typography>}
          >
            <Typography variant="body2">
              {reservation.member.name} · {reservation.status} · Exemplar{' '}
              {reservation.bookCopy?.assetCode ?? 'aguardando'} · Expira{' '}
              {formatDate(reservation.holdUntil ?? reservation.expiresAt)}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Stack>
  );
}

export function MemberLibraryHistory({ memberId }: { memberId: string }) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['library', 'member-history', memberId, page],
    queryFn: () => getMemberLibraryHistory(memberId, { page, pageSize: 20 }),
  });
  if (history.isPending)
    return <CircularProgress aria-label="Carregando biblioteca" />;
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
      <HistoryPagination history={history.data} onPageChange={setPage} />
    </Stack>
  );
}

export function HistoryPagination({
  history,
  onPageChange,
}: {
  history: LibraryHistory & { totalEvents?: number };
  onPageChange: (page: number) => void;
}) {
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
      rowsPerPageOptions={[20]}
      onPageChange={(_, page) => onPageChange(page + 1)}
      labelRowsPerPage="Por página em cada lista"
      labelDisplayedRows={({ page }) => `Página ${page + 1}`}
      getItemAriaLabel={(type) =>
        type === 'next'
          ? 'Próxima página do histórico'
          : 'Página anterior do histórico'
      }
    />
  );
}
