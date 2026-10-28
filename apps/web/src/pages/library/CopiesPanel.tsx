import { RecordTable, RecordRow } from '../../components/RecordTable';
import { STATUS_LABELS } from '../../lib/status-labels';
import { StatusChip } from '../../components/DataPresentation';
import { Box, Button, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import { formatDate } from '../../lib/format';
import * as api from '../../lib/library-api';
import {
  memberField,
  copyFields,
  justification,
  copyInput,
  valuesOf,
  type OpenLibraryAction,
} from './library-actions';
import { Paged } from './LibraryPaged';
import type { Page } from '@church/shared';
export function CopiesPanel({
  copies,
  page,
  pageSize,
  setPage,
  setPageSize,
  open,
  setCopyHistory,
}: {
  copies: Page<api.BookCopy>;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  open: OpenLibraryAction;
  setCopyHistory: (id: string) => void;
}) {
  return (
    <Paged
      total={copies.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel="Livro / Exemplar"
        imageLabel="Capa"
        label={'Exemplares'}
        summaryLabel="Situação"
      >
        {copies.items.map((copy) => (
          <RecordRow
            key={copy.id}
            image={
              copy.book.cover ? (
                <Box
                  component="img"
                  src={copy.book.cover}
                  alt={`Capa de ${copy.book.title}`}
                  loading="lazy"
                  sx={{ width: 80, height: 112, objectFit: 'contain' }}
                />
              ) : (
                <Typography variant="caption">Sem capa</Typography>
              )
            }
            primary={
              <>
                <Typography variant="h6">
                  {copy.book.title} · {copy.assetCode}
                </Typography>
              </>
            }
            actions={
              <>
                <Can permission="LIBRARY_HISTORY_READ">
                  <Button onClick={() => setCopyHistory(copy.id)}>
                    Histórico
                  </Button>
                </Can>
                <Can permission="LIBRARY_COPY_UPDATE">
                  <Button
                    onClick={() =>
                      open(
                        'Editar exemplar / manutenção',
                        (v) =>
                          api.updateCopy(copy.id, {
                            ...copyInput(v, true),
                            ...(v.status === 'AVAILABLE' ||
                            v.status === 'MAINTENANCE' ||
                            v.status === 'LOST' ||
                            v.status === 'DISPOSED'
                              ? { status: v.status }
                              : {}),
                            justification: v.justification ?? '',
                          }),
                        [
                          ...copyFields,
                          {
                            name: 'status',
                            label: 'Status (vazio mantém atual)',
                            options: [
                              '',
                              'PENDING_INVENTORY',
                              'AVAILABLE',
                              'MAINTENANCE',
                              'LOST',
                              'DISPOSED',
                            ],
                          },
                          justification,
                        ],
                        {
                          ...valuesOf(copy),
                          acquiredAt: copy.acquiredAt?.slice(0, 10) ?? '',
                          status: '',
                        },
                      )
                    }
                  >
                    Editar / status
                  </Button>
                </Can>
                {(copy.status === 'AVAILABLE' ||
                  copy.status === 'RESERVED') && (
                  <Can permission="LIBRARY_LOAN_CREATE">
                    <Button
                      onClick={() =>
                        open(
                          `Emprestar ${copy.assetCode}`,
                          (v) =>
                            api.borrow({
                              memberId: v.memberId ?? '',
                              bookCopyId: copy.id,
                              observations: v.observations || undefined,
                            }),
                          [
                            memberField,
                            {
                              name: 'observations',
                              label: 'Observações',
                            },
                          ],
                        )
                      }
                    >
                      Emprestar
                    </Button>
                  </Can>
                )}
              </>
            }
            summary={
              <>
                <Typography>
                  {<StatusChip status={copy.status} />} ·{' '}
                  {STATUS_LABELS[copy.condition ?? ''] ?? copy.condition} ·{' '}
                  {copy.location} · Cota: {copy.shelfmark ?? 'Por atribuir'} ·{' '}
                  {copy.notes}
                </Typography>
              </>
            }
          >
            <Typography variant="caption">
              ID: {copy.id} · Livro: {copy.bookId} · Barcode: {copy.barcode} ·
              QR: {copy.qrCode} · Aquisição:{' '}
              {copy.acquiredAt ? formatDate(copy.acquiredAt) : '—'}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
