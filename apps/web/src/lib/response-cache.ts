import { responseCacheTtl } from '@church/shared';

const PREFIX = 'ponte-private-api-v1-';
const STORED_AT = 'x-ponte-stored-at';
const dataTimes = new WeakMap<object, number>();
/** Propagate the original response time through common API envelope selectors. */
export function rememberResponseTime(value: unknown, response: Response) {
  const time = Number(response.headers.get(STORED_AT));
  if (!time || time > Date.now()) return;
  function visit(item: unknown) {
    if (!item || typeof item !== 'object' || dataTimes.has(item)) return;
    dataTimes.set(item, time);
    for (const child of Object.values(item)) visit(child);
  }
  visit(value);
}
export function responseDataTime(data: unknown) {
  return data && typeof data === 'object' ? dataTimes.get(data) : undefined;
}
let scope: string | null = null;
let revision = 0;
let writesInFlight = 0;
const channel =
  typeof window !== 'undefined' && window.BroadcastChannel
    ? new window.BroadcastChannel('ponte-private-api')
    : null;
if (channel)
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === 'clear' || event.data === 'invalidate') {
      revision++;
      if (event.data === 'clear') scope = null;
    }
  };
// Serialize CacheStorage operations: logout/invalidation must win over pending puts.
let pending: Promise<unknown> = Promise.resolve();
function storage<T>(work: () => Promise<T>): Promise<T | undefined> {
  const result = pending.then(async () => {
    if (typeof caches === 'undefined') return undefined;
    try {
      return await work();
    } catch {
      return undefined;
    }
  });
  pending = result;
  return result;
}

/** Only call after /auth/me (or a successful login) verifies this identity. */
export async function activateResponseCache(user: {
  id: string;
  permissions: readonly string[];
}) {
  const current = ++revision;
  scope = null;
  if (!globalThis.crypto?.subtle) return;
  const identity = JSON.stringify([user.id, [...user.permissions].sort()]);
  // A non-secret namespace; never persist an access token or Authorization header.
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(identity),
    );
  } catch {
    return;
  }
  const name =
    PREFIX +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  await storage(async () => {
    for (const key of await caches.keys())
      if (key.startsWith(PREFIX) && key !== name) await caches.delete(key);
  });
  if (current === revision) scope = name;
}

export function clearResponseCache() {
  scope = null;
  channel?.postMessage('clear');
  return invalidateResponseCache();
}

export function invalidateResponseCache() {
  revision++;
  channel?.postMessage('invalidate');
  return storage(async () => {
    for (const key of await caches.keys())
      if (key.startsWith(PREFIX)) await caches.delete(key);
  });
}

export async function beginResponseCacheMutation() {
  writesInFlight++;
  await invalidateResponseCache();
  return async () => {
    writesInFlight--;
    await invalidateResponseCache();
  };
}

export function responseCacheTicket() {
  return { scope, revision };
}
type Ticket = ReturnType<typeof responseCacheTicket>;
function current(ticket: Ticket) {
  return (
    writesInFlight === 0 &&
    ticket.scope !== null &&
    ticket.scope === scope &&
    ticket.revision === revision
  );
}
function key(url: string) {
  return new URL(url, window.location.origin).href;
}

export async function readResponseCache(
  url: string,
  path: string,
  ticket: Ticket,
) {
  if (!current(ticket) || !responseCacheTtl(path)) return undefined;
  return storage(async () => {
    if (!current(ticket)) return undefined;
    const cache = await caches.open(ticket.scope!);
    const response = await cache.match(key(url));
    if (!response) return undefined;
    const ttl = Math.min(
      responseCacheTtl(path),
      Number(
        response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 0,
      ),
    );
    const age = Date.now() - Number(response.headers.get(STORED_AT) ?? 0);
    if (ttl > 0 && age >= 0 && age < ttl * 1000 && current(ticket))
      return response;
    await cache.delete(key(url));
    return undefined;
  });
}

export async function writeResponseCache(
  url: string,
  path: string,
  response: Response,
  ticket: Ticket,
) {
  const policy = response.headers.get('cache-control') ?? '';
  if (
    !current(ticket) ||
    !response.ok ||
    !responseCacheTtl(path) ||
    !/\bprivate\b/i.test(policy) ||
    /\bno-store\b/i.test(policy) ||
    !/max-age=[1-9]\d*/.test(policy) ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    return;
  const copy = response.clone();
  await storage(async () => {
    if (!current(ticket)) return;
    const headers = new Headers(copy.headers);
    // Vary: Authorization is for HTTP caches; our cache is already scoped and stores no credentials.
    headers.delete('vary');
    headers.set(STORED_AT, String(Date.now()));
    const cached = new Response(await copy.arrayBuffer(), {
      status: copy.status,
      headers,
    });
    if (current(ticket)) {
      const cache = await caches.open(ticket.scope!);
      await cache.put(key(url), cached);
      const entries = await cache.keys();
      for (const entry of entries.slice(0, Math.max(0, entries.length - 200)))
        await cache.delete(entry);
    }
  });
}
