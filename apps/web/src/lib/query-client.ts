import { QueryCache, QueryClient } from '@tanstack/react-query';
import { retryQuery } from './query-retry';
import { responseDataTime } from './response-cache';

/** React Query memory cache; the API transport also honors HTTP TTL in CacheStorage. */
export function createQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onSuccess(data, query) {
        const time = responseDataTime(data);
        if (time) query.setState({ dataUpdatedAt: time });
      },
    }),
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        staleTime: 6 * 60 * 60_000,
        gcTime: 6 * 60 * 60_000 + 5 * 60_000,
        retry: retryQuery,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
  client.setQueryDefaults(['community', 'birthdays'], {
    staleTime: 24 * 60 * 60_000,
    gcTime: 25 * 60 * 60_000,
  });
  client.setQueryDefaults(['finance'], {
    staleTime: 60 * 60_000,
    gcTime: 65 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  client.setQueryDefaults(['library'], {
    staleTime: 6 * 60 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  client.setQueryDefaults(['member-portal', 'books'], {
    staleTime: 6 * 60 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  client.setQueryDefaults(['reimbursements'], {
    staleTime: 60 * 60_000,
    gcTime: 65 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  for (const key of [
    'copies',
    'loans',
    'reservations',
    'availability',
    'dashboard',
  ]) {
    client.setQueryDefaults(['library', key], {
      staleTime: 0,
      networkMode: 'always',
      refetchOnMount: 'always',
      refetchInterval: 30_000,
    });
  }
  client.setQueryDefaults(['member-portal', 'dashboard'], {
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  for (const key of [
    'health',
    'notifications',
    'audit',
    'frontend-errors',
    'frontend-error-stats',
    'frontend-error-map',
  ]) {
    client.setQueryDefaults([key], {
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    });
  }
  return client;
}
