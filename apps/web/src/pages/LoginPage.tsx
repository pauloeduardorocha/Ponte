import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Button,
  Link,
  Stack,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { AuthCard } from '../components/AuthCard';
import { ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { emailSchema } from '../lib/validation';
import { passkeysSupported, passkeyError } from '../lib/passkeys';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.'),
});

type LoginFields = z.infer<typeof loginSchema>;

interface LoginLocationState {
  from?: { pathname: string; search?: string };
  notice?: string;
}

export function LoginPage() {
  const { login, loginWithPasskey, signOutNotice, sessionError } = useAuth();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const autoPasskeyStarted = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;
  const target = state.from
    ? `${state.from.pathname}${state.from.search ?? ''}`
    : '/';
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onPasskeyLogin = useCallback(async () => {
    setError(null);
    setPasskeyBusy(true);
    try {
      await loginWithPasskey();
      navigate(target, { replace: true });
    } catch (err) {
      setError(passkeyError(err));
    } finally {
      setPasskeyBusy(false);
    }
  }, [loginWithPasskey, navigate, target]);

  useEffect(() => {
    if (isDesktop || !passkeysSupported() || autoPasskeyStarted.current) return;
    autoPasskeyStarted.current = true;
    void onPasskeyLogin();
  }, [isDesktop, onPasskeyLogin]);

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'E-mail ou senha inválidos.'
          : errorMessage(err),
      );
    }
  });

  return (
    <AuthCard
      title="Acesse sua conta"
      subtitle="Entre para continuar na plataforma da igreja."
      notice={state.notice ?? signOutNotice ?? undefined}
      error={error ?? sessionError}
      footer={
        <>
          <Link component={RouterLink} to="/forgot-password">
            Esqueci minha senha
          </Link>
          <Link component={RouterLink} to="/register">
            Criar uma conta
          </Link>
        </>
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            fullWidth
            error={Boolean(formState.errors.email)}
            helperText={formState.errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="current-password"
            fullWidth
            error={Boolean(formState.errors.password)}
            helperText={formState.errors.password?.message}
            {...register('password')}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={formState.isSubmitting || passkeyBusy}
          >
            Entrar
          </Button>
          {isDesktop && passkeysSupported() && (
            <Button
              variant="outlined"
              size="large"
              disabled={formState.isSubmitting || passkeyBusy}
              onClick={onPasskeyLogin}
            >
              {passkeyBusy ? 'A confirmar…' : 'Entrar com biometria ou passkey'}
            </Button>
          )}
        </Stack>
      </Box>
    </AuthCard>
  );
}
