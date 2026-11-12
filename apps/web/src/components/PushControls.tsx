import { t as translate, useLocale } from '../i18n';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { usePushNotifications } from '../lib/use-push-notifications';

export function PushControls() {
  useLocale();
  const { supported, permission, config, subscription, action, active } =
    usePushNotifications();
  if (!supported)
    return (
      <Alert severity="info">
        {translate(
          'Este navegador não disponibiliza notificações push. No iPhone/iPad, adicione a aplicação ao ecrã principal e abra-a pelo ícone para ativar os alertas. As mensagens continuam disponíveis aqui. As notificações são importantes para ficar por dentro dos avisos e novidades da igreja.',
        )}
      </Alert>
    );
  return (
    <Stack spacing={1} alignItems="flex-start">
      {!active && (permission !== 'granted' || subscription.isSuccess) && (
        <Alert severity="warning">
          {translate(
            'Ative as notificações para ficar por dentro das novidades da igreja. Elas são importantes para acompanhar os avisos, eventos e novidades de A Ponte.',
          )}
          {permission === 'denied' &&
            translate(
              ' As notificações estão bloqueadas neste navegador. Permita-as nas definições do site e volte a esta página para ativar os alertas.',
            )}
          {permission === 'granted' &&
            !subscription.isPending &&
            !subscription.data &&
            translate(
              ' A permissão já foi concedida; falta ativar os alertas neste dispositivo.',
            )}
        </Alert>
      )}
      <Typography color="text.secondary">
        {translate(
          'Receba um alerta neste dispositivo quando chegar uma mensagem, mesmo com a aplicação fechada.',
        )}
      </Typography>
      {(config.isError || subscription.isError) && (
        <Alert severity="error">
          {translate('Não foi possível consultar as notificações push.')}{' '}
          <Button
            onClick={() => {
              void config.refetch();
              void subscription.refetch();
            }}
          >
            {translate('Tentar novamente')}
          </Button>
        </Alert>
      )}
      {config.data && !config.data.enabled && (
        <Alert severity="info">
          {translate(
            'As notificações push ainda não estão disponíveis. As mensagens internas continuam funcionando.',
          )}
        </Alert>
      )}
      {action.isError && <Alert severity="error">{action.error.message}</Alert>}
      <Button
        variant="outlined"
        disabled={
          action.isPending ||
          subscription.isPending ||
          subscription.isError ||
          (!subscription.data && !config.data?.enabled)
        }
        onClick={() => action.mutate(subscription.data ? 'disable' : 'enable')}
      >
        {action.isPending
          ? translate('Aguarde…')
          : subscription.data
            ? translate('Desativar notificações neste dispositivo')
            : translate('Ativar notificações neste dispositivo')}
      </Button>
    </Stack>
  );
}
