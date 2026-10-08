import type { ReactNode } from 'react';
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Permission } from '../lib/types';
import { useAuth } from './auth-context';

export function FullPageLoader() {
  return (
    <Box className="login-page">
      <CircularProgress aria-label="Carregando sessão" />
    </Box>
  );
}

/** Allows access only to authenticated users; otherwise redirects to login. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageLoader />;
  }
  if (status === 'anonymous') {
    const state = { from: location };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

/** Public-only pages (login, register...) redirect authenticated users home. */
export function PublicOnly() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <FullPageLoader />;
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export function ForbiddenPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1" fontWeight={700}>
        Acesso negado
      </Typography>
      <Alert severity="warning">
        Você não tem permissão para acessar esta área.
      </Alert>
    </Stack>
  );
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : <ForbiddenPage />;
}

/** Renders children only when the current user has the permission. */
export function Can({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : null;
}
