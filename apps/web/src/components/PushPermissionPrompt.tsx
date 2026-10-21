import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { usePushNotifications } from '../lib/use-push-notifications';

const PREFIX = 'ponte:push-invitation:v1:';
function invitationSeen(userId: string) {
  try {
    return localStorage.getItem(PREFIX + userId) === 'seen';
  } catch {
    return false;
  }
}

export function PushPermissionPrompt({
  userId,
  blocked,
}: {
  userId: string;
  blocked: boolean;
}) {
  const [dismissed, setDismissed] = useState(() => invitationSeen(userId));
  const push = usePushNotifications();
  function rememberDismissal() {
    try {
      localStorage.setItem(PREFIX + userId, 'seen');
    } catch {
      /* Optional device preference. */
    }
    setDismissed(true);
  }
  function dismiss() {
    if (!push.action.isPending) rememberDismissal();
  }
  const open =
    !blocked &&
    !dismissed &&
    push.supported &&
    push.permission !== 'denied' &&
    push.config.data?.enabled === true &&
    push.subscription.isSuccess &&
    !push.subscription.data;
  return (
    <Dialog
      open={open}
      onClose={dismiss}
      aria-labelledby="push-invitation-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="push-invitation-title">
        Fique por dentro das novidades da igreja
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          As notificações são importantes para acompanhar os avisos, eventos e
          novidades de A Ponte, mesmo com a aplicação fechada. Ative os alertas
          neste dispositivo para não perder as próximas novidades.
        </DialogContentText>
        {push.action.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {push.action.error.message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          '& > :not(style) ~ :not(style)': { ml: { xs: 0, sm: 1 } },
        }}
      >
        <Button disabled={push.action.isPending} onClick={dismiss}>
          Agora não
        </Button>
        <Button
          variant="contained"
          disabled={!push.canEnable}
          onClick={() =>
            push.action.mutate('enable', {
              onSuccess: rememberDismissal,
            })
          }
        >
          {push.action.isPending ? 'A ativar…' : 'Ativar notificações'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
