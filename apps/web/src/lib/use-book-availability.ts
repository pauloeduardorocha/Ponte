import { useQuery } from '@tanstack/react-query';
import type { BookAvailability } from '@church/shared';
import { apiRequest } from './api';

/** Catalogue text may be cached for hours; inventory is fetched separately. */
export function useBookAvailability(bookIds: string[], enabled = true) {
  const ids = [...new Set(bookIds)].sort().join(',');
  const query = useQuery({
    queryKey: ['library', 'availability', ids],
    queryFn: () =>
      apiRequest<BookAvailability[]>('/library/books/availability', {
        query: { ids },
      }),
    enabled: enabled && !!ids,
    networkMode: 'always',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
    refetchInterval: 30_000,
  });
  const values = new Map((query.data ?? []).map((row) => [row.bookId, row]));
  return { ...query, values };
}
