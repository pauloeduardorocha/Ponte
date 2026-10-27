import { APP_VERSION } from './app-version';

export const UPDATE_MESSAGE =
  'Há uma atualização disponível. Guarde as alterações e atualize para continuar. Confira se o pedido foi guardado antes de tentar novamente.';

let availableVersion: string | null = null;
let pending: Promise<string | null> | null = null;
let checkedAt = 0;
const listeners = new Set<() => void>();

export const getAvailableVersion = () => availableVersion;
export function subscribeToAppUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isNewer(version: unknown): version is string {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
    return false;
  const current = APP_VERSION.split('.').map(Number);
  const next = version.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (next[i] !== current[i]) return next[i]! > current[i]!;
  }
  return false;
}

/** Independent of API/auth and SW caches; never blocks error handling indefinitely. */
export function checkForAppUpdate(): Promise<string | null> {
  if (pending) return pending;
  if (
    availableVersion ||
    Date.now() - checkedAt < 10_000 ||
    navigator.onLine === false
  )
    return Promise.resolve(availableVersion);
  pending = (async () => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = (async () => {
        const response = await fetch(`/app-version.json?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const data: unknown = await response.json();
        const version =
          data && typeof data === 'object' && 'version' in data
            ? data.version
            : null;
        return isNewer(version) ? version : null;
      })();
      const result = await Promise.race([
        request,
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort();
            resolve(null);
          }, 2500);
        }),
      ]);
      if (result) {
        availableVersion = result;
        listeners.forEach((listener) => listener());
      }
      return availableVersion;
    } catch {
      // Failed version checks keep the original error, without generating reports.
      return availableVersion;
    } finally {
      clearTimeout(timeout);
      checkedAt = Date.now();
      pending = null;
    }
  })();
  return pending;
}

export async function messageAfterUpdateCheck(
  original: string,
): Promise<string> {
  return (await checkForAppUpdate()) ? UPDATE_MESSAGE : original;
}
