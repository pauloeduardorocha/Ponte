import { FineMovements } from './FineMovements';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { StatusChip } from '../../components/DataPresentation';
import { Button, Stack, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import * as api from '../../lib/library-api';
import { justification, type OpenLibraryAction } from './library-actions';
import { Paged } from './LibraryPaged';
import type { Page } from '@church/shared';
export function FinesPanel({
  fines,
  page,
  pageSize,
  setPage,
  setPageSize,
  open,
}: {
  fines: Page<api.Fine>;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  open: OpenLibraryAction;
}) {
  return (
    <Paged
      total={fines.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel="Livro / Membro"
        label={'Multas'}
        summaryLabel="Valores"
      >
        {fines.items.map((fine) => (
          <RecordRow
            key={fine.id}
            primary={
              <>
                <Typography variant="h6">
                  {fine.loan?.member.name} · {fine.loan?.bookCopy.book.title}
                </Typography>
              </>
            }
            actions={
              <>
                {fine.status === 'OPEN' && (
                  <Stack direction="row">
                    <Can permission="LIBRARY_FINE_PAY">
                      <Button
                        onClick={() => {
                          const idempotencyKey = crypto.randomUUID();
                          open(
                            'Pagamento (total ou parcial)',
                            (v) =>
                              api.payFine(fine.id, {
                                amount: v.amount ?? '',
                                idempotencyKey,
                              }),
                            [
                              {
                                name: 'amount',
                                label: 'Valor decimal (ex.: 1.50)',
                                required: true,
                              },
                            ],
                          );
                        }}
                      >
                        Pagar
                      </Button>
                    </Can>
                    <Can permission="LIBRARY_FINE_ADJUST">
                      <Button
                        onClick={() =>
                          open(
                            'Desconto',
                            (v) =>
                              api.adjustFine(fine.id, {
                                kind: 'DISCOUNT',
                                amount: v.amount ?? '',
                                justification: v.justification ?? '',
                              }),
                            [
                              {
                                name: 'amount',
                                label: 'Valor do desconto',
                                required: true,
                              },
                              justification,
                            ],
                          )
                        }
                      >
                        Desconto
                      </Button>
                      <Button
                        onClick={() =>
                          open(
                            'Perdoar saldo da multa',
                            (v) =>
                              api.adjustFine(fine.id, {
                                kind: 'FORGIVE',
                                justification: v.justification ?? '',
                              }),
                            [justification],
                          )
                        }
                      >
                        Perdoar
                      </Button>
                      <Button
                        color="error"
                        onClick={() =>
                          open(
                            'Cancelar saldo da multa',
                            (v) =>
                              api.adjustFine(fine.id, {
                                kind: 'CANCEL',
                                justification: v.justification ?? '',
                              }),
                            [justification],
                          )
                        }
                      >
                        Cancelar multa
                      </Button>
                    </Can>
                  </Stack>
                )}
              </>
            }
            summary={
              <>
                <Typography>
                  {<StatusChip status={fine.status} />} · Total {fine.amount} ·
                  Pago {fine.paidAmount} · Ajustado {fine.discount} · Saldo{' '}
                  {api.fineBalance(fine)}
                </Typography>
              </>
            }
          >
            <FineMovements fineId={fine.id} />
          </RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
