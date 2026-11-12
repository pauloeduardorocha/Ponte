import { t as translate, useLocale } from '../../i18n';
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
  useLocale();
  return (
    <Paged
      total={loans.total}
      page={page}
      setPage={setPage}
      pageSize={pageSize}
      setPageSize={setPageSize}
    >
      <RecordTable
        primaryLabel={translate('Livro / Membro')}
        label={translate('Empréstimos')}
        summaryLabel={translate('Estado / Prazos')}
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
                          open(translate('Devolver exemplar'), () =>
                            api.returnLoan(loan.id),
                          )
                        }
                      >
                        {translate('Devolver')}
                      </Button>
                      <Button
                        color="error"
                        onClick={() =>
                          open(
                            translate('Encerrar empréstimo'),
                            (v) =>
                              api.closeLoan(loan.id, {
                                status:
                                  v.status === 'LOST' ? 'LOST' : 'CANCELLED',
                                justification: v.justification ?? '',
                              }),
                            [
                              {
                                name: 'status',
                                label: translate('Motivo'),
                                required: true,
                                options: ['LOST', 'CANCELLED'],
                              },
                              justification,
                            ],
                          )
                        }
                      >
                        {translate('Perda / cancelamento')}
                      </Button>
                    </Can>
                    {loan.status === 'ACTIVE' && (
                      <Can permission="LIBRARY_LOAN_RENEW">
                        <Button
                          onClick={() =>
                            open(translate('Renovar empréstimo'), () =>
                              api.renewLoan(loan.id),
                            )
                          }
                        >
                          {translate('Renovar')}
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
                  {<StatusChip status={loan.status} />}{' '}
                  {translate(' · Emprestado')} {formatDate(loan.borrowedAt)}{' '}
                  {translate(' · Vence ')}
                  {formatDate(loan.dueAt)} {translate('· Devolvido')}{' '}
                  {loan.returnedAt ? formatDate(loan.returnedAt) : '—'}{' '}
                  {translate(' · Renovações ')}
                  {loan.renewedCount}
                </Typography>
              </>
            }
          >
            <Typography variant="caption">
              ID: {loan.id} {translate(' · Membro: ')}
              {loan.memberId} · {loan.observations}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Paged>
  );
}
