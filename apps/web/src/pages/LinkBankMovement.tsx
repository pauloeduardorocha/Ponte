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
}: {
  id: string;
  direction: string;
  accountId?: string;
  date: string;
  amount: string;
}) {
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
        Vincular a {income ? 'receita' : 'despesa'} existente
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth>
        <DialogTitle>
          Vincular a {income ? 'receita' : 'despesa'} existente
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography>
              Escolha um registro concluído com a mesma conta, data (
              {date.slice(0, 10)}) e valor ({amount}). O vínculo preserva a
              categoria e as associações existentes, sem cadastrar outro
              registro financeiro.
            </Typography>
            <EntitySelect
              endpoint={`/finance/${income ? 'incomes' : 'expenses'}`}
              query={{
                status: 'COMPLETED',
                start: date.slice(0, 10),
                end: date.slice(0, 10),
                ...(accountId ? { accountId } : {}),
              }}
              label={income ? 'Receita existente' : 'Despesa existente'}
              value={ledgerId}
              onChange={(event) => setLedgerId(event.target.value)}
            />
            {link.error && <Alert severity="error">{link.error.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!ledgerId || link.isPending}
            onClick={() => link.mutate()}
          >
            Vincular registro
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
