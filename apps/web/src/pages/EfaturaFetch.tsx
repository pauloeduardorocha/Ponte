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
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';

export function EfaturaFetch({
  importId,
  period,
  open,
  onOpenChange,
}: {
  importId: string;
  period?: { start: string | null; end: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [nif, setNif] = useState('');
  const [password, setPassword] = useState('');
  const fetchInvoices = useMutation({
    mutationFn: async () => {
      const request = apiRequest<{ inserted: number; duplicates: number }>(
        '/finance/invoices/fetch',
        {
          method: 'POST',
          body: { bankImportId: importId, nif, password },
        },
      );
      setPassword('');
      return request;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['finance'] });
    },
  });
  const close = () => {
    setPassword('');
    onOpenChange(false);
  };
  if (
    !hasPermission('FINANCE_INVOICE_READ') ||
    !hasPermission('FINANCE_INVOICE_IMPORT')
  )
    return null;
  return (
    <>
      <Button
        disabled={fetchInvoices.isPending}
        onClick={() => {
          fetchInvoices.reset();
          onOpenChange(true);
        }}
      >
        Buscar faturas no e-Fatura
      </Button>
      {fetchInvoices.isPending && (
        <Alert severity="info">
          Consultando o e-Fatura… Você pode continuar categorizando os
          movimentos.
        </Alert>
      )}
      {fetchInvoices.data && (
        <Alert severity="success">
          {fetchInvoices.data.inserted} faturas importadas;{' '}
          {fetchInvoices.data.duplicates} duplicadas ignoradas. Use “Associar
          fatura” nas despesas para conferir as sugestões por valor.
        </Alert>
      )}
      {!open && fetchInvoices.error && (
        <Alert severity="error">{fetchInvoices.error.message}</Alert>
      )}
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Buscar faturas deste extrato?</DialogTitle>
        <DialogContent>
          <Stack
            spacing={2}
            component="form"
            id="efatura-fetch"
            sx={{ mt: 1 }}
            onSubmit={(event) => {
              event.preventDefault();
              fetchInvoices.mutate();
            }}
          >
            <Typography>
              Consulte o e-Fatura para encontrar faturas que correspondam às
              despesas importadas.
            </Typography>
            {period?.start && period.end && (
              <Typography variant="body2">
                Período: {period.start} a {period.end}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              O NIF e a senha são usados apenas nesta consulta. A senha não é
              armazenada. A consulta pode não ser concluída se o portal exigir
              MFA ou CAPTCHA.
            </Typography>
            <TextField
              label="NIF"
              required
              value={nif}
              autoComplete="off"
              disabled={fetchInvoices.isPending}
              onChange={(event) => setNif(event.target.value)}
              slotProps={{
                htmlInput: {
                  inputMode: 'numeric',
                  pattern: '[0-9]{9}',
                  maxLength: 9,
                },
              }}
            />
            <TextField
              label="Senha das Finanças"
              required
              type="password"
              autoComplete="off"
              value={password}
              disabled={fetchInvoices.isPending}
              onChange={(event) => setPassword(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 256 } }}
            />
            {fetchInvoices.error && (
              <Alert severity="error">
                {fetchInvoices.error.message} As receitas e despesas do extrato
                já estão cadastradas.
              </Alert>
            )}
            {fetchInvoices.data && (
              <Alert severity="success">
                Faturas disponíveis para associação aos movimentos.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>
            {fetchInvoices.isPending || fetchInvoices.data
              ? 'Continuar nos movimentos'
              : 'Agora não'}
          </Button>
          {!fetchInvoices.data && (
            <Button
              type="submit"
              form="efatura-fetch"
              variant="contained"
              disabled={
                fetchInvoices.isPending || !/^\d{9}$/.test(nif) || !password
              }
            >
              {fetchInvoices.isPending ? 'Consultando…' : 'Buscar faturas'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
