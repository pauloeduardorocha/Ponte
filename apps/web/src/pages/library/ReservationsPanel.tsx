import { t as translate, useLocale } from '../../i18n';
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
  useLocale();
  return (
    <Paged
      total={reservations.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel={translate('Livro / Membro')}
        label={translate('Reservas')}
        summaryLabel={translate('Prazos')}
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
                        open(
                          translate(
                            'Cancelar reserva e promover próximo membro',
                          ),
                          () => api.cancelReservation(r.id),
                        )
                      }
                    >
                      {translate('Cancelar reserva')}
                    </Button>
                  </Can>
                )}
                {r.status === 'READY' && r.bookCopyId && (
                  <Can permission="LIBRARY_LOAN_CREATE">
                    <Button
                      onClick={() =>
                        open(translate('Emprestar exemplar reservado'), () =>
                          api.borrow({
                            memberId: r.memberId,
                            bookCopyId: r.bookCopyId!,
                          }),
                        )
                      }
                    >
                      {translate('Emprestar reserva')}
                    </Button>
                  </Can>
                )}
              </>
            }
            summary={
              <>
                <Typography>
                  {translate('Fila criada ')}
                  {formatDate(r.createdAt)} {translate(' · Expira')}{' '}
                  {formatDate(r.holdUntil ?? r.expiresAt)}{' '}
                  {translate(' · Exemplar')}{' '}
                  {r.bookCopy?.assetCode ?? translate('aguardando')}
                </Typography>
              </>
            }
          ></RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
