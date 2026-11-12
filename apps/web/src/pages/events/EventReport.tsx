import { t as translate, useLocale } from '../../i18n';
import { RecordTable, RecordRow } from '../../components/RecordTable';
import { Stack, Typography } from '@mui/material';
type Report = {
  checkedIn: number;
  registrations: { status: string; _count: { _all: number } }[];
  finances: {
    currency: string;
    status: string;
    count: number;
    amount: string;
    discounts: string;
    fees: string;
    refunds: string;
    net: string;
  }[];
};
const statuses: Record<string, string> = {
  get REGISTERED() {
    return translate('Inscritos');
  },
  get APPROVED() {
    return translate('Aprovados');
  },
  get CANCELLED() {
    return translate('Cancelados');
  },
  get CONFIRMED() {
    return translate('Confirmados');
  },
  get PENDING() {
    return translate('Pendentes');
  },
  get FAILED() {
    return translate('Falhados');
  },
  get REFUNDED() {
    return translate('Reembolsados');
  },
};
export function EventReport({ value }: { value: unknown }) {
  useLocale();
  const report = value as Report;
  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        {translate('Presenças: ')}
        {report.checkedIn}
      </Typography>
      {report.registrations.map((r) => (
        <Typography key={r.status}>
          {statuses[r.status] ?? r.status}: {r._count._all}
        </Typography>
      ))}
      <RecordTable hasActions={false}>
        {report.finances.map((f) => (
          <RecordRow
            key={`${f.currency}-${f.status}`}
            primary={
              <>
                <Typography variant="h6">
                  {translate('Pagamentos ')}
                  {statuses[f.status]?.toLowerCase() ?? f.status} ({f.currency})
                </Typography>
              </>
            }
            hasActions={false}
            actions={<></>}
          >
            <Typography>
              {translate('Quantidade: ')}
              {f.count} {translate(' · Valor total: ')}
              {f.amount}
            </Typography>
            <Typography>
              {translate('Descontos: ')}
              {f.discounts} {translate(' · Taxas: ')}
              {f.fees} {translate(' · Reembolsos:')} {f.refunds}
            </Typography>
            <Typography>
              {translate('Receita líquida: ')}
              {f.net}
            </Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Stack>
  );
}
