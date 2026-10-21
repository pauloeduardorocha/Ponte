// These origin-scoped hints improve the UI; they never establish authentication.
const PREFIX = 'ponte:passkeys:v1:';
const PAUSED = 'ponte:passkeys:auto-paused';
const REMIND_AFTER = 30 * 24 * 60 * 60 * 1000;

interface Preference {
  credentialId?: string;
  remindAfter?: number;
}

function read(userId: string): Preference {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(PREFIX + userId) ?? '{}',
    );
    if (!value || typeof value !== 'object') return {};
    return {
      credentialId:
        'credentialId' in value && typeof value.credentialId === 'string'
          ? value.credentialId
          : undefined,
      remindAfter:
        'remindAfter' in value && typeof value.remindAfter === 'number'
          ? value.remindAfter
          : undefined,
    };
  } catch {
    return {};
  }
}

function write(userId: string, value: Preference) {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(value));
  } catch {
    // Private browsing or blocked storage must not prevent sign-in.
  }
}

export function shouldOfferPasskey(userId: string) {
  const preference = read(userId);
  return (
    !preference.credentialId && (preference.remindAfter ?? 0) <= Date.now()
  );
}

export function postponePasskey(userId: string) {
  write(userId, { ...read(userId), remindAfter: Date.now() + REMIND_AFTER });
}

export function rememberPasskey(userId: string, credentialId: string) {
  write(userId, { credentialId });
  resumeAutomaticPasskeyLogin();
}

export function forgetPasskey(userId: string, credentialId: string) {
  if (read(userId).credentialId === credentialId) write(userId, {});
}

export function pauseAutomaticPasskeyLogin() {
  try {
    sessionStorage.setItem(PAUSED, 'true');
  } catch {
    /* Optional hint. */
  }
}

export function resumeAutomaticPasskeyLogin() {
  try {
    sessionStorage.removeItem(PAUSED);
  } catch {
    /* Optional hint. */
  }
}

export function shouldStartPasskeyLogin() {
  try {
    if (sessionStorage.getItem(PAUSED)) return false;
    return Object.keys(localStorage).some(
      (key) =>
        key.startsWith(PREFIX) &&
        Boolean(read(key.slice(PREFIX.length)).credentialId),
    );
  } catch {
    return false;
  }
}
