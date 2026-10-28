export interface NetworkFailureDetails {
  kind: 'offline' | 'network' | 'timeout' | 'cancelled';
  attempts: number;
  durationMs: number;
  exception: string;
  online: boolean;
  visibility: string;
}

export class NetworkFailure extends Error {
  constructor(readonly diagnostics: NetworkFailureDetails) {
    super('Falha de comunicação com o servidor.');
    this.name = 'NetworkFailure';
  }
}

/** Retry only GET transport failures. Never replay a write whose outcome is unknown. */
export async function networkRequest(
  url: string,
  options: RequestInit,
  isCurrent: () => boolean,
  timeoutMs = options.method === 'GET' ? 15_000 : 90_000,
) {
  const startedAt = performance.now();
  const read = options.method === 'GET';
  const budgetMs = read ? 30_000 : timeoutMs;
  const delays = [500, 1500];
  let attempts = 0;
  const fail = (kind: NetworkFailureDetails['kind'], error?: unknown) => {
    // Names only: exception messages and stacks may contain URLs or credentials.
    const name = error instanceof Error ? error.name : 'unknown';
    return new NetworkFailure({
      kind,
      attempts,
      durationMs: Math.round(performance.now() - startedAt),
      exception: ['TypeError', 'AbortError', 'TimeoutError', 'Error'].includes(
        name,
      )
        ? name
        : 'unknown',
      online: navigator.onLine,
      visibility: document.visibilityState,
    });
  };
  while (true) {
    if (!isCurrent()) throw fail('cancelled');
    if (navigator.onLine === false) throw fail('offline');
    const remainingMs = budgetMs - (performance.now() - startedAt);
    if (remainingMs <= 0) throw fail('timeout');
    attempts++;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const response = await Promise.race([
        fetch(url, { ...options, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              timedOut = true;
              controller.abort();
              reject(new DOMException('Request timed out', 'TimeoutError'));
            },
            Math.min(timeoutMs, remainingMs),
          );
        }),
      ]);
      return {
        response,
        attempts,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      if (!isCurrent()) throw fail('cancelled');
      if (timedOut) throw fail('timeout', error);
      const offline = () => navigator.onLine === false;
      if (!read || attempts >= 3 || offline()) {
        throw fail(offline() ? 'offline' : 'network', error);
      }
    } finally {
      clearTimeout(timer);
    }
    const delay = Math.min(
      delays[attempts - 1]!,
      Math.max(0, budgetMs - (performance.now() - startedAt)),
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
