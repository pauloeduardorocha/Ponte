import { useSyncExternalStore } from 'react';
import { Alert } from '@mui/material';

function subscribe(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export function NetworkStatusBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return online ? null : (
    <Alert
      severity="warning"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar + 1,
      }}
    >
      Sem conexão. Mantenha esta página aberta para preservar suas alterações.
      As consultas serão retomadas quando a rede voltar.
    </Alert>
  );
}
