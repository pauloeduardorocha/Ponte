import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from './api';
import {
  browserSubscription,
  disablePush,
  enablePush,
  supportsPush,
} from './push';

function watchPermission(changed: () => void) {
  window.addEventListener('focus', changed);
  document.addEventListener('visibilitychange', changed);
  return () => {
    window.removeEventListener('focus', changed);
    document.removeEventListener('visibilitychange', changed);
  };
}
function permissionSnapshot() {
  return 'Notification' in window
    ? (Notification.permission ?? 'default')
    : 'unsupported';
}

export function usePushNotifications() {
  const { user } = useAuth();
  const client = useQueryClient();
  const supported = supportsPush();
  const permission = useSyncExternalStore(watchPermission, permissionSnapshot);
  const config = useQuery({
    queryKey: ['push-config', user?.id],
    queryFn: () =>
      apiRequest<{ enabled: boolean; publicKey: string | null }>(
        '/operations/push/config',
      ),
    enabled: !!user && supported,
    retry: false,
  });
  const subscription = useQuery({
    queryKey: ['push-subscription', user?.id],
    queryFn: browserSubscription,
    enabled: !!user && supported,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const action = useMutation({
    mutationFn: (mode: 'enable' | 'disable') => {
      if (mode === 'disable') return disablePush();
      if (!config.data?.enabled || !config.data.publicKey)
        throw new Error('As notificações push ainda não estão disponíveis.');
      return enablePush(config.data.publicKey);
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['push-subscription'] }),
  });
  return {
    supported,
    permission,
    config,
    subscription,
    action,
    active: permission === 'granted' && !!subscription.data,
    canEnable:
      config.data?.enabled &&
      !subscription.isPending &&
      !subscription.isError &&
      !action.isPending,
  };
}
