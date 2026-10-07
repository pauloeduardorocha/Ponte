import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSessionExpired, refreshSession, setAccessToken } from '../lib/api';
import * as authApi from '../lib/auth-api';
import type { CurrentUser, Permission } from '../lib/types';
import { errorMessage } from '../lib/errors';
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context';

interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  signOutNotice: string | null;
}

const ANONYMOUS: AuthState = {
  status: 'anonymous',
  user: null,
  signOutNotice: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    signOutNotice: null,
  });

  const clearSession = useCallback(
    (notice?: string) => {
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
        if (active)
          setState({ status: 'authenticated', user, signOutNotice: null });
      } catch (error) {
        if (active) {
          setAccessToken(null);
          setState({ ...ANONYMOUS, signOutNotice: errorMessage(error) });
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
      setState({ status: 'authenticated', user, signOutNotice: null });
    } catch (error) {
      setAccessToken(null);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      clearSession();
    } catch (error) {
      clearSession(
        `A sessão local foi encerrada, mas não foi possível confirmar a revogação no servidor: ${errorMessage(error)}`,
      );
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: Permission) =>
      state.user?.permissions.includes(permission) ?? false,
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, clearSession, hasPermission }),
    [state, login, logout, clearSession, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
