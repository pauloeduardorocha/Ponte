import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Can } from '../../auth/guards';
import * as api from '../../lib/library-api';
import { valuesOf, type OpenLibraryAction } from './library-actions';
export function SettingsPanel({
  settings,
  open,
}: {
  settings: api.LibrarySettings;
  open: OpenLibraryAction;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography>
            Prazo: {settings.defaultLoanDays} dias · Limite: {settings.maxBooks}{' '}
            livros · Renovações: {settings.maxRenewals}
          </Typography>
          <Typography>
            Carência: {settings.graceDays} dias · Multa diária:{' '}
            {settings.dailyFine} · Bloquear atrasados:{' '}
            {settings.blockOverdue ? 'Sim' : 'Não'}
          </Typography>
          <Typography>
            Retirada reservada: {settings.holdDays} dias · Validade da fila:{' '}
            {settings.reservationDays} dias · Calendário UTC
          </Typography>
          <Can permission="LIBRARY_SETTINGS_UPDATE">
            <Button
              onClick={() =>
                open(
                  'Configurações da biblioteca',
                  (v) =>
                    api.updateLibrarySettings({
                      defaultLoanDays: Number(v.defaultLoanDays),
                      maxBooks: Number(v.maxBooks),
                      maxRenewals: Number(v.maxRenewals),
                      graceDays: Number(v.graceDays),
                      dailyFine: v.dailyFine ?? '',
                      blockOverdue: v.blockOverdue === 'true',
                      holdDays: Number(v.holdDays),
                      reservationDays: Number(v.reservationDays),
                    }),
                  [
                    {
                      name: 'defaultLoanDays',
                      label: 'Prazo de empréstimo (dias)',
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'maxBooks',
                      label: 'Limite de livros por membro',
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'maxRenewals',
                      label: 'Limite de renovações',
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'graceDays',
                      label: 'Carência (dias)',
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'dailyFine',
                      label: 'Multa diária decimal',
                      required: true,
                    },
                    {
                      name: 'blockOverdue',
                      label: 'Bloquear atrasados',
                      options: ['true', 'false'],
                      required: true,
                    },
                    {
                      name: 'holdDays',
                      label: 'Prazo de retirada (dias)',
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'reservationDays',
                      label: 'Validade da fila (dias)',
                      type: 'number',
                      required: true,
                    },
                  ],
                  valuesOf(settings!),
                )
              }
            >
              Editar configurações
            </Button>
          </Can>
        </Stack>
      </CardContent>
    </Card>
  );
}
