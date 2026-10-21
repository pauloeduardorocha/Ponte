import { Alert, Button, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import {
  browserSubscription,
  disablePush,
  enablePush,
  supportsPush,
} from '../lib/push';
import { useAuth } from '../auth/auth-context';

export function PushControls() {
  const { user } = useAuth();
  const client = useQueryClient();
  const supported = supportsPush();
  const config = useQuery({
    queryKey: ['push-config', user?.id],
    queryFn: () =>
      apiRequest<{ enabled: boolean; publicKey: string | null }>(
        '/operations/push/config',
      ),
    enabled: supported,
    retry: false,
  });
  const subscription = useQuery({
    queryKey: ['push-subscription', user?.id],
    queryFn: browserSubscription,
    enabled: supported,
    retry: false,
  });
  const action = useMutation({
    mutationFn: () =>
      subscription.data ? disablePush() : enablePush(config.data!.publicKey!),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['push-subscription'] }),
  });
  if (!supported)
    return (
      <Alert severity="info">
        Este navegador não disponibiliza notificações push. No iPhone/iPad,
        adicione a aplicação ao ecrã principal e abra-a pelo ícone para ativar
        os alertas. As mensagens continuam disponíveis aqui.
      </Alert>
    );
  return (
    <Stack spacing={1} alignItems="flex-start">
      <Typography color="text.secondary">
        Receba um alerta neste dispositivo quando chegar uma mensagem, mesmo com
        a aplicação fechada.
      </Typography>
      {(config.isError || subscription.isError) && (
        <Alert severity="error">
          Não foi possível consultar as notificações push.{' '}
          <Button
            onClick={() => {
              void config.refetch();
              void subscription.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </Alert>
      )}
      {config.data && !config.data.enabled && (
        <Alert severity="info">
          As notificações push ainda não estão disponíveis. As mensagens
          internas continuam funcionando.
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
        onClick={() => action.mutate()}
      >
        {action.isPending
          ? 'Aguarde…'
          : subscription.data
            ? 'Desativar notificações neste dispositivo'
            : 'Ativar notificações neste dispositivo'}
      </Button>
    </Stack>
  );
}
