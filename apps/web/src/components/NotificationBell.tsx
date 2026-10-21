import { useEffect } from 'react';
import { Badge } from '@mui/material';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';

export function NotificationBell() {
  const { user } = useAuth();
  const client = useQueryClient();
  const unread = useQuery({
    queryKey: ['notifications', 'unread', user?.id],
    queryFn: () => apiRequest<{ count: number }>('/operations/inbox/unread'),
    enabled: !!user,
    refetchInterval: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const serviceWorker = navigator.serviceWorker;
    const received = (event: MessageEvent) => {
      if (event.data?.type === 'PONTE_NOTIFICATION') {
        void client.invalidateQueries({ queryKey: ['notifications'] });
        void client.invalidateQueries({ queryKey: ['operations', 'inbox'] });
      }
    };
    serviceWorker.addEventListener('message', received);
    return () => serviceWorker.removeEventListener('message', received);
  }, [client]);
  return (
    <Badge badgeContent={unread.data?.count ?? 0} color="error" max={99}>
      <NotificationsNoneRounded />
    </Badge>
  );
}
