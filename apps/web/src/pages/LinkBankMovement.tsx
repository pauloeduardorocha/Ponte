import { t as translate, useLocale } from '../i18n';
import { formatDateOnly } from '../lib/format';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { EntitySelect } from '../components/EntitySelect';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';

export function LinkBankMovement({
  id,
  direction,
  accountId,
  date,
  amount,
  onLinked,
}: {
  id: string;
  direction: string;
  accountId?: string;
  date: string;
  amount: string;
  onLinked?: () => void;
}) {
  useLocale();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ledgerId, setLedgerId] = useState('');
  const income = direction === 'CREDIT';
  const link = useMutation({
    mutationFn: () =>
      apiRequest(`/finance/banking/transactions/${id}/link`, {
        method: 'POST',
        body: income ? { incomeId: ledgerId } : { expenseId: ledgerId },
      }),
    onSuccess: () => {
      setOpen(false);
      onLinked?.();
      void client.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  if (
    !hasPermission('FINANCE_RECONCILE') ||
    !hasPermission('FINANCE_TRANSACTION_READ')
  )
    return null;
  return (
    <>
      <Button
        onClick={() => {
          link.reset();
          setLedgerId('');
          setOpen(true);
        }}
      >
        {translate('Vincular a ')}
        {income ? 'receita' : 'despesa'} {translate(' existente')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth>
        <DialogTitle>
          {translate('Vincular a ')}
          {income ? 'receita' : 'despesa'} {translate(' existente')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>
              {translate(
                'Escolha um registro concluído com a mesma conta, data (',
              )}
              {formatDateOnly(date)}
              {translate(') e valor (')}
              {amount}
              {translate(
                '). O vínculo preserva a categoria e as associações existentes, sem cadastrar outro registro financeiro.',
              )}
            </Typography>
            <EntitySelect
              endpoint={`/finance/${income ? 'incomes' : 'expenses'}`}
              query={{
                status: 'COMPLETED',
                start: date.slice(0, 10),
                end: date.slice(0, 10),
                ...(accountId ? { accountId } : {}),
              }}
              label={
                income
                  ? translate('Receita existente')
                  : translate('Despesa existente')
              }
              value={ledgerId}
              onChange={(event) => setLedgerId(event.target.value)}
            />
            {link.error && <Alert severity="error">{link.error.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>
            {translate('Cancelar')}
          </Button>
          <Button
            variant="contained"
            disabled={!ledgerId || link.isPending}
            onClick={() => link.mutate()}
          >
            {translate('Vincular registro')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
