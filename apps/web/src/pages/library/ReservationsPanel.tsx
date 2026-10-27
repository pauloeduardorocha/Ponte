import { RecordTable, RecordRow } from '../../components/RecordTable';
import { StatusChip } from '../../components/DataPresentation';
import { Button, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import { formatDate } from '../../lib/format';
import * as api from '../../lib/library-api';
import { type OpenLibraryAction } from './library-actions';
import { Paged } from './LibraryPaged';
import type { Page } from '@church/shared';
export function ReservationsPanel({
  reservations,
  page,
  pageSize,
  setPage,
  setPageSize,
  open,
}: {
  reservations: Page<api.Reservation>;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  open: OpenLibraryAction;
}) {
  return (
    <Paged
      total={reservations.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel="Livro / Membro"
        label={'Reservas'}
        summaryLabel="Prazos"
      >
        {reservations.items.map((r) => (
          <RecordRow
            key={r.id}
            primary={
              <>
                <Typography variant="h6">
                  {r.book.title} · {r.member.name} ·{' '}
                  <StatusChip status={r.status} />
                </Typography>
              </>
            }
            actions={
              <>
                {['WAITING', 'READY'].includes(r.status) && (
                  <Can permission="LIBRARY_RESERVATION_CANCEL">
                    <Button
                      onClick={() =>
                        open('Cancelar reserva e promover próximo membro', () =>
                          api.cancelReservation(r.id),
                        )
                      }
                    >
                      Cancelar reserva
                    </Button>
                  </Can>
                )}
                {r.status === 'READY' && r.bookCopyId && (
                  <Can permission="LIBRARY_LOAN_CREATE">
                    <Button
                      onClick={() =>
                        open('Emprestar exemplar reservado', () =>
                          api.borrow({
                            memberId: r.memberId,
                            bookCopyId: r.bookCopyId!,
                          }),
                        )
                      }
                    >
                      Emprestar reserva
                    </Button>
                  </Can>
                )}
              </>
            }
            summary={
              <>
                <Typography>
                  Fila criada {formatDate(r.createdAt)} · Expira{' '}
                  {formatDate(r.holdUntil ?? r.expiresAt)} · Exemplar{' '}
                  {r.bookCopy?.assetCode ?? 'aguardando'}
                </Typography>
              </>
            }
          ></RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
