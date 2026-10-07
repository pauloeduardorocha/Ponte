import { useQuery } from '@tanstack/react-query';
import { Alert, CircularProgress, Stack, Typography } from '@mui/material';
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
      {history.loans.map((loan) => (
        <Stack key={loan.id} spacing={0.5}>
          <Typography fontWeight={600}>
            {loan.bookCopy.book.title} — {loan.bookCopy.assetCode} —{' '}
            {loan.status}
          </Typography>
          <Typography variant="body2">
            {loan.member.name} · Emprestado: {formatDate(loan.borrowedAt)} ·
            Vencimento: {formatDate(loan.dueAt)} · Devolução:{' '}
            {loan.returnedAt ? formatDate(loan.returnedAt) : '—'} · Renovações:{' '}
            {loan.renewedCount}
          </Typography>
          <Typography variant="body2">
            Operador: {loan.createdBy} · Recebido por: {loan.returnedBy ?? '—'}{' '}
            · {loan.observations}
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
                  Pagamento {payment.amount} · {formatDate(payment.createdAt)} ·{' '}
                  {payment.createdBy}
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
        </Stack>
      ))}
      <Typography variant="h6">Reservas</Typography>
      {!history.reservations.length && (
        <Alert severity="info">Nenhuma reserva.</Alert>
      )}
      {history.reservations.map((reservation) => (
        <Typography key={reservation.id}>
          {reservation.book.title} · {reservation.member.name} ·{' '}
          {reservation.status} · Exemplar{' '}
          {reservation.bookCopy?.assetCode ?? 'aguardando'} · Expira{' '}
          {formatDate(reservation.holdUntil ?? reservation.expiresAt)}
        </Typography>
      ))}
    </Stack>
  );
}

export function MemberLibraryHistory({ memberId }: { memberId: string }) {
  const history = useQuery({
    queryKey: ['library', 'member-history', memberId],
    queryFn: () => getMemberLibraryHistory(memberId),
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
  return <HistoryContent history={history.data} />;
}
