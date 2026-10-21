import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { apiRequest, setAccessToken } from './api';
import type { AuthSession } from './types';
import { rememberPasskey } from './passkey-preferences';

export const passkeysSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof window.PublicKeyCredential !== 'undefined';

export async function platformPasskeysSupported() {
  if (!passkeysSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export const listPasskeys = () => apiRequest<Passkey[]>('/auth/passkeys');
export const removePasskey = (id: string) =>
  apiRequest<void>(`/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export function passkeyError(error: unknown) {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? error.name
      : undefined;
  if (name === 'NotAllowedError' || name === 'AbortError')
    return 'Operação cancelada ou expirada. Pode tentar novamente ou entrar com a senha.';
  if (name === 'InvalidStateError')
    return 'Esta passkey já está registada. Use-a para entrar.';
  return error instanceof Error
    ? error.message
    : 'Não foi possível utilizar a passkey.';
}

export async function registerPasskey(
  password: string,
  name: string,
  onThisDevice = false,
) {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const { challengeId, options } = await apiRequest<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>('/auth/passkeys/register/options', {
    method: 'POST',
    body: { password },
    skipAuthRefresh: true,
  });
  const response = await startRegistration({
    optionsJSON: onThisDevice
      ? {
          ...options,
          authenticatorSelection: {
            ...options.authenticatorSelection,
            authenticatorAttachment: 'platform',
          },
        }
      : options,
  });
  await apiRequest('/auth/passkeys/register/verify', {
    method: 'POST',
    body: { challengeId, response, name },
    skipAuthRefresh: true,
  });
  return response.id;
}

export async function loginWithPasskey() {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const { challengeId, options } = await apiRequest<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/passkeys/login/options', { method: 'POST', skipAuthRefresh: true });
  const response = await startAuthentication({ optionsJSON: options });
  const session = await apiRequest<AuthSession>('/auth/passkeys/login/verify', {
    method: 'POST',
    body: { challengeId, response },
    skipAuthRefresh: true,
  });
  setAccessToken(session.accessToken);
  rememberPasskey(session.user.id, response.id);
  return session;
}
