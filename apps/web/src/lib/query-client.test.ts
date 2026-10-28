import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './query-client';
import { MutationObserver, onlineManager } from '@tanstack/react-query';

describe('Session query cache', () => {
  let client: ReturnType<typeof createQueryClient>;
  beforeEach(() => {
    vi.useFakeTimers();
    client = createQueryClient();
  });
  afterEach(() => {
    client.clear();
    vi.useRealTimers();
  });
  it.each([
    [['community', 'birthdays', 'week', 'user'], 24 * 60 * 60_000],
    [['finance', 'accounts', 1], 60 * 60_000],
    [['finance', 'lookup', 'categories'], 60 * 60_000],
    [['library', 'books', 1], 6 * 60 * 60_000],
    [['member-portal', 'books', 1], 6 * 60 * 60_000],
    [['community', 'dashboard'], 6 * 60 * 60_000],
  ])(
    'reuses %j until freshness expires and then fetches again',
    async (queryKey, staleTime) => {
      const queryFn = vi.fn().mockResolvedValue({ value: 1 });
      const options = { queryKey: queryKey as unknown[], queryFn };
      await client.fetchQuery(options);
      await client.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(Number(staleTime) + 1);
      await client.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(2);
    },
  );
  it.each(['copies', 'reservations', 'availability'])(
    'always fetches current %s rather than reusing the six-hour catalogue cache',
    async (resource) => {
      const queryFn = vi.fn().mockResolvedValue({ available: 0 });
      const options = { queryKey: ['library', resource], queryFn };
      await client.fetchQuery(options);
      await client.fetchQuery(options);
      expect(queryFn).toHaveBeenCalledTimes(2);
    },
  );
  it('invalidates fresh financial data after a write and separates pages and filters', async () => {
    const queryFn = vi.fn().mockResolvedValue(1);
    await client.fetchQuery({ queryKey: ['finance', 'accounts', 1], queryFn });
    await client.fetchQuery({ queryKey: ['finance', 'accounts', 2], queryFn });
    expect(queryFn).toHaveBeenCalledTimes(2);
    await client.invalidateQueries({
      queryKey: ['finance'],
      refetchType: 'none',
    });
    await client.fetchQuery({ queryKey: ['finance', 'accounts', 1], queryFn });
    expect(queryFn).toHaveBeenCalledTimes(3);
  });
  it('retains loaded data if background refresh fails and removes it on session clear', async () => {
    const queryKey = ['library', 'books'];
    await client.fetchQuery({ queryKey, queryFn: async () => ['book'] });
    await client.invalidateQueries({ queryKey, refetchType: 'none' });
    await expect(
      client.fetchQuery({
        queryKey,
        retry: false,
        queryFn: async () => {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow('offline');
    expect(client.getQueryData(queryKey)).toEqual(['book']);
    client.clear();
    expect(client.getQueryData(queryKey)).toBeUndefined();
  });
  it('does not queue offline mutations or replay writes after reconnect', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('offline'));
    const mutation = new MutationObserver(client, { mutationFn });
    onlineManager.setOnline(false);
    try {
      await expect(mutation.mutate(undefined)).rejects.toThrow('offline');
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mutationFn).toHaveBeenCalledTimes(1);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
