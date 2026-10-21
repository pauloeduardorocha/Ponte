import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSessionExpired, refreshSession, setAccessToken } from '../lib/api';
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

    async function restoreSession() {
      try {
        const session = await refreshSession();
        if (!session) {
          if (active) setState(ANONYMOUS);
          return;
        }
        const user = await authApi.fetchCurrentUser();
        if (active) setState({ ...ANONYMOUS, status: 'authenticated', user });
      } catch (error) {
        if (active) {
          setAccessToken(null);
          setState({ ...ANONYMOUS, sessionError: errorMessage(error) });
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => onSessionExpired(() => clearSession()), [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
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
  }, []);

  const loginWithPasskey = useCallback(async () => {
    const session = await passkeyLogin();
    setEnrollment(null);
    queryClient.clear();
    setState({ ...ANONYMOUS, status: 'authenticated', user: session.user });
  }, [queryClient]);

  const logout = useCallback(async () => {
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

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      loginWithPasskey,
      logout,
      clearSession,
      hasPermission,
    }),
    [state, login, loginWithPasskey, logout, clearSession, hasPermission],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {state.status === 'authenticated' && state.user && (
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
    </AuthContext.Provider>
  );
}
