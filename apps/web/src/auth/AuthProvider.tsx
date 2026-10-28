import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  onSessionExpired,
  refreshSession,
  setAccessToken,
} from '../lib/api';
import * as authApi from '../lib/auth-api';
import {
  loginWithPasskey as passkeyLogin,
  passkeysSupported,
} from '../lib/passkeys';
import {
  pauseAutomaticPasskeyLogin,
  resumeAutomaticPasskeyLogin,
  shouldOfferPasskey,
} from '../lib/passkey-preferences';
import type { CurrentUser, Permission } from '../lib/types';
import { errorMessage } from '../lib/errors';
import { disablePush, stopBrowserPush } from '../lib/push';
import { AccountThemeProvider } from '../theme/AccountThemeProvider';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context';

const PasskeyEnrollment = lazy(() =>
  import('../components/PasskeyEnrollment').then((module) => ({
    default: module.PasskeyEnrollment,
  })),
);
const PushPermissionPrompt = lazy(() =>
  import('../components/PushPermissionPrompt').then((module) => ({
    default: module.PushPermissionPrompt,
  })),
);

interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  signOutNotice: string | null;
  sessionError: string | null;
}

const ANONYMOUS: AuthState = {
  status: 'anonymous',
  user: null,
  signOutNotice: null,
  sessionError: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const restoreAfterReconnect = useRef(false);
  const identityRevision = useRef(0);
  const [enrollment, setEnrollment] = useState<{
    userId: string;
    password: string;
  } | null>(null);
  const closeEnrollment = useCallback(() => setEnrollment(null), []);
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    signOutNotice: null,
    sessionError: null,
  });

  const clearSession = useCallback(
    (notice?: string) => {
      identityRevision.current++;
      restoreAfterReconnect.current = false;
      setEnrollment(null);
      void stopBrowserPush().catch(() => undefined);
      setAccessToken(null);
      queryClient.clear();
      setState({ ...ANONYMOUS, signOutNotice: notice ?? null });
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    let restoring = false;

    async function restoreSession() {
      if (restoring) return;
      restoring = true;
      const revision = identityRevision.current;
      restoreAfterReconnect.current = false;
      try {
        const session = await refreshSession();
        if (revision !== identityRevision.current) return;
        if (!session) {
          if (active) setState(ANONYMOUS);
          return;
        }
        const user = await authApi.fetchCurrentUser();
        if (active && revision === identityRevision.current)
          setState({ ...ANONYMOUS, status: 'authenticated', user });
      } catch (error) {
        if (active && revision === identityRevision.current) {
          restoreAfterReconnect.current =
            error instanceof ApiError &&
            (error.status === 0 || error.status >= 500);
          setAccessToken(null);
          setState({ ...ANONYMOUS, sessionError: errorMessage(error) });
        }
      } finally {
        restoring = false;
      }
    }

    const reconnect = () => {
      if (active && restoreAfterReconnect.current) {
        setState({ ...ANONYMOUS, status: 'loading' });
        void restoreSession();
      }
    };
    window.addEventListener('online', reconnect);
    void restoreSession();
    return () => {
      active = false;
      window.removeEventListener('online', reconnect);
    };
  }, []);

  useEffect(() => onSessionExpired(() => clearSession()), [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      identityRevision.current++;
      restoreAfterReconnect.current = false;
      queryClient.clear();
      await authApi.login(email, password);
      try {
        const user = await authApi.fetchCurrentUser();
        resumeAutomaticPasskeyLogin();
        setEnrollment(
          passkeysSupported() && shouldOfferPasskey(user.id)
            ? { userId: user.id, password }
            : null,
        );
        setState({ ...ANONYMOUS, status: 'authenticated', user });
      } catch (error) {
        setAccessToken(null);
        throw error;
      }
    },
    [queryClient],
  );

  const loginWithPasskey = useCallback(async () => {
    identityRevision.current++;
    restoreAfterReconnect.current = false;
    const session = await passkeyLogin();
    setEnrollment(null);
    queryClient.clear();
    setState({ ...ANONYMOUS, status: 'authenticated', user: session.user });
  }, [queryClient]);

  const logout = useCallback(async () => {
    identityRevision.current++;
    restoreAfterReconnect.current = false;
    pauseAutomaticPasskeyLogin();
    try {
      await disablePush().catch(() => stopBrowserPush().catch(() => undefined));
      await authApi.logout();
      clearSession();
    } catch (error) {
      clearSession();
      setState({
        ...ANONYMOUS,
        sessionError: `A sessão local foi encerrada, mas não foi possível confirmar a revogação no servidor: ${errorMessage(error)}`,
      });
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: Permission) =>
      state.user?.permissions.includes(permission) ?? false,
    [state.user],
  );

  const updateColorMode = useCallback(
    async (mode: 'system' | 'light' | 'dark') => {
      const userId = state.user?.id;
      if (!userId) return;
      const preferences = await authApi.updatePreferences({ colorMode: mode });
      setState((current) =>
        current.user?.id === userId
          ? {
              ...current,
              user: { ...current.user, colorMode: preferences.colorMode },
            }
          : current,
      );
    },
    [state.user?.id],
  );

  const updatePushPreference = useCallback(
    async (key: authApi.PushPreferenceKey, preference: boolean) => {
      const userId = state.user?.id;
      if (!userId) return;
      const updated = await authApi.updatePreferences({ [key]: preference });
      setState((current) =>
        current.user?.id === userId
          ? { ...current, user: { ...current.user, ...updated } }
          : current,
      );
    },
    [state.user?.id],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      loginWithPasskey,
      logout,
      clearSession,
      hasPermission,
      updateColorMode,
      updatePushPreference,
    }),
    [
      state,
      login,
      loginWithPasskey,
      logout,
      clearSession,
      hasPermission,
      updateColorMode,
      updatePushPreference,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      <AccountThemeProvider>
        {children}
        {state.status === 'authenticated' &&
          state.user &&
          state.user.status !== 'PENDING_APPROVAL' && (
            <Suspense fallback={null}>
              <PushPermissionPrompt
                key={state.user.id}
                userId={state.user.id}
                blocked={!!enrollment}
              />
            </Suspense>
          )}
        {enrollment &&
          state.status === 'authenticated' &&
          state.user?.id === enrollment.userId && (
            <Suspense fallback={null}>
              <PasskeyEnrollment {...enrollment} onClose={closeEnrollment} />
            </Suspense>
          )}
      </AccountThemeProvider>
    </AuthContext.Provider>
  );
}
