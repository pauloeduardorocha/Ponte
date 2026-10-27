import { RecordTable, RecordRow } from '../../components/RecordTable';
import { StatusChip } from '../../components/DataPresentation';
import { Button, Stack, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import { formatDate } from '../../lib/format';
import * as api from '../../lib/library-api';
import { justification, type OpenLibraryAction } from './library-actions';
import { Paged } from './LibraryPaged';
import type { Page } from '@church/shared';
export function LoansPanel({
  loans,
  page,
  pageSize,
  setPage,
  setPageSize,
  open,
}: {
  loans: Page<api.Loan>;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  open: OpenLibraryAction;
}) {
  return (
    <Paged
      total={loans.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel="Livro / Membro"
        label={'Empréstimos'}
        summaryLabel="Estado / Prazos"
      >
        {loans.items.map((loan) => (
          <RecordRow
            key={loan.id}
            primary={
              <>
                <Typography variant="h6">
                  {loan.bookCopy.book.title} · {loan.bookCopy.assetCode} ·{' '}
                  {loan.member.name}
                </Typography>
              </>
            }
            actions={
              <>
                {['ACTIVE', 'OVERDUE'].includes(loan.status) && (
                  <Stack direction="row">
                    <Can permission="LIBRARY_LOAN_RETURN">
                      <Button
                        onClick={() =>
                          open('Devolver exemplar', () =>
                            api.returnLoan(loan.id),
                          )
                        }
                      >
                        Devolver
                      </Button>
                      <Button
                        color="error"
                        onClick={() =>
                          open(
                            'Encerrar empréstimo',
                            (v) =>
                              api.closeLoan(loan.id, {
                                status:
                                  v.status === 'LOST' ? 'LOST' : 'CANCELLED',
                                justification: v.justification ?? '',
                              }),
                            [
                              {
                                name: 'status',
                                label: 'Motivo',
                                required: true,
                                options: ['LOST', 'CANCELLED'],
                              },
                              justification,
                            ],
                          )
                        }
                      >
                        Perda / cancelamento
                      </Button>
                    </Can>
                    {loan.status === 'ACTIVE' && (
                      <Can permission="LIBRARY_LOAN_RENEW">
                        <Button
                          onClick={() =>
                            open('Renovar empréstimo', () =>
                              api.renewLoan(loan.id),
                            )
                          }
                        >
                          Renovar
                        </Button>
                      </Can>
                    )}
                  </Stack>
                )}
              </>
            }
            summary={
              <>
                <Typography>
                  {<StatusChip status={loan.status} />} · Emprestado{' '}
                  {formatDate(loan.borrowedAt)} · Vence {formatDate(loan.dueAt)}{' '}
                  · Devolvido{' '}
                  {loan.returnedAt ? formatDate(loan.returnedAt) : '—'} ·
                  Renovações {loan.renewedCount}
                </Typography>
              </>
            }
          >
            <Typography variant="caption">
              ID: {loan.id} · Membro: {loan.memberId} · {loan.observations}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
