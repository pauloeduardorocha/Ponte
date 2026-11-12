import { t as translate, useLocale } from '../i18n';
import { useState } from 'react';
import { Alert, Button, IconButton, Stack } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { Link } from 'react-router-dom';
import { usePushNotifications } from '../lib/use-push-notifications';

const PREFIX = 'ponte:push-banner:v1:';
export function PushPermissionBanner({ userId }: { userId: string }) {
  useLocale();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(PREFIX + userId) === 'dismissed';
    } catch {
      return false;
    }
  });
  const push = usePushNotifications();
  if (
    dismissed ||
    !push.supported ||
    push.active ||
    !push.config.data?.enabled ||
    !push.subscription.isSuccess
  )
    return null;
  function dismiss() {
    try {
      localStorage.setItem(PREFIX + userId, 'dismissed');
    } catch {
      /* Optional device preference. */
    }
    setDismissed(true);
  }
  return (
    <Alert
      severity="warning"
      aria-label={translate('Aviso de notificações')}
      sx={{
        mx: { xs: 2, sm: 3 },
        mt: 2,
        flexWrap: 'wrap',
        '& .MuiAlert-message': { flex: '1 1 220px' },
        '& .MuiAlert-action': { ml: 'auto', pl: 0, pt: 0 },
      }}
      action={
        <Stack direction="row" alignItems="center" spacing={1}>
          {push.permission === 'denied' ? (
            <Button component={Link} to="/inbox" color="inherit" size="small">
              {translate('Como ativar')}
            </Button>
          ) : (
            <Button
              color="inherit"
              size="small"
              disabled={!push.canEnable}
              onClick={() => push.action.mutate('enable')}
            >
              {push.action.isPending
                ? translate('A ativar…')
                : translate('Ativar notificações')}
            </Button>
          )}
          <IconButton
            color="inherit"
            size="small"
            aria-label={translate('Dispensar aviso de notificações')}
            onClick={dismiss}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
      }
    >
      {translate(
        'As notificações são importantes para acompanhar as novidades da igreja. Ative os alertas neste dispositivo.',
      )}
      {push.permission === 'denied' &&
        translate(' A permissão está bloqueada nas definições do navegador.')}
      {push.action.isError && <span> {push.action.error.message}</span>}
    </Alert>
  );
}
