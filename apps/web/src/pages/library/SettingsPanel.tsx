import { t as translate, useLocale } from '../../i18n';
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
  useLocale();
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography>
            {translate('Prazo: ')}
            {settings.defaultLoanDays} {translate(' dias · Limite: ')}
            {settings.maxBooks} {translate('livros · Renovações: ')}
            {settings.maxRenewals}
          </Typography>
          <Typography>
            {translate('Carência: ')}
            {settings.graceDays} {translate(' dias · Multa diária:')}{' '}
            {settings.dailyFine} {translate(' · Bloquear atrasados:')}{' '}
            {settings.blockOverdue ? translate('Sim') : translate('Não')}
          </Typography>
          <Typography>
            {translate('Retirada reservada: ')}
            {settings.holdDays} {translate(' dias · Validade da fila:')}{' '}
            {settings.reservationDays} {translate(' dias · Calendário UTC')}
          </Typography>
          <Can permission="LIBRARY_SETTINGS_UPDATE">
            <Button
              onClick={() =>
                open(
                  translate('Configurações da biblioteca'),
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
                      label: translate('Prazo de empréstimo (dias)'),
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'maxBooks',
                      label: translate('Limite de livros por membro'),
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'maxRenewals',
                      label: translate('Limite de renovações'),
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'graceDays',
                      label: translate('Carência (dias)'),
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'dailyFine',
                      label: translate('Multa diária decimal'),
                      required: true,
                    },
                    {
                      name: 'blockOverdue',
                      label: translate('Bloquear atrasados'),
                      options: ['true', 'false'],
                      required: true,
                    },
                    {
                      name: 'holdDays',
                      label: translate('Prazo de retirada (dias)'),
                      type: 'number',
                      required: true,
                    },
                    {
                      name: 'reservationDays',
                      label: translate('Validade da fila (dias)'),
                      type: 'number',
                      required: true,
                    },
                  ],
                  valuesOf(settings!),
                )
              }
            >
              {translate('Editar configurações')}
            </Button>
          </Can>
        </Stack>
      </CardContent>
    </Card>
  );
}
