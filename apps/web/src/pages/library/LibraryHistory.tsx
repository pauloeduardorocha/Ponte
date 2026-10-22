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
                <FineMovements fineId={loan.fine.id} />
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
  const [pageSize, setPageSize] = useState(10);
  const history = useQuery({
    queryKey: ['library', 'member-history', memberId, page, pageSize],
    queryFn: () => getMemberLibraryHistory(memberId, { page, pageSize }),
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
