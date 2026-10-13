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
  REGISTERED: 'Inscritos',
  APPROVED: 'Aprovados',
  CANCELLED: 'Cancelados',
  CONFIRMED: 'Confirmados',
  PENDING: 'Pendentes',
  FAILED: 'Falhados',
  REFUNDED: 'Reembolsados',
};
export function EventReport({ value }: { value: unknown }) {
  const report = value as Report;
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Presenças: {report.checkedIn}</Typography>
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
                  Pagamentos {statuses[f.status]?.toLowerCase() ?? f.status} (
                  {f.currency})
                </Typography>
              </>
            }
            hasActions={false}
            actions={<></>}
          >
            <Typography>
              Quantidade: {f.count} · Valor total: {f.amount}
            </Typography>
            <Typography>
              Descontos: {f.discounts} · Taxas: {f.fees} · Reembolsos:{' '}
              {f.refunds}
            </Typography>
            <Typography>Receita líquida: {f.net}</Typography>
          </RecordRow>
        ))}
      </RecordTable>
    </Stack>
  );
}
