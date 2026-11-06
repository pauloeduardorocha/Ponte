import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from './api';

export interface TranslationStatus {
  active: boolean;
  audienceUrl: string | null;
  expiresAt: string | null;
}
export function useLiveTranslation() {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: ['live-translation', 'status', user?.id],
    queryFn: () => apiRequest<TranslationStatus>('/live-translation/status'),
    enabled: Boolean(user && user.status !== 'PENDING_APPROVAL'),
    staleTime: 15000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    if (!query.data?.expiresAt) return;
    const delay = Date.parse(query.data.expiresAt) - Date.now();
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, delay) + 20,
    );
    return () => window.clearTimeout(timer);
  }, [query.data?.expiresAt]);
  const active = Boolean(
    query.data?.active &&
    query.data.audienceUrl &&
    query.data.expiresAt &&
    Date.parse(query.data.expiresAt) > Math.max(now, Date.now()),
  );
  return { ...query, active };
}
export function translationApiUrl() {
  return new URL(
    import.meta.env.VITE_API_URL ?? '/api/v1',
    window.location.origin,
  ).href.replace(/\/$/, '');
}
