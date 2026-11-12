import { t as translate, useLocale } from '../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import TranslateRounded from '@mui/icons-material/TranslateRounded';
import { useLiveTranslation } from '../lib/live-translation';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { AuthCard } from '../components/AuthCard';
import { ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { emailSchema } from '../lib/validation';
import { passkeysSupported, passkeyError } from '../lib/passkeys';
import {
  pauseAutomaticPasskeyLogin,
  shouldStartPasskeyLogin,
} from '../lib/passkey-preferences';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: () => translate('Informe a senha.') }),
});

type LoginFields = z.infer<typeof loginSchema>;

interface LoginLocationState {
  from?: { pathname: string; search?: string };
  notice?: string;
}

export function LoginPage() {
  useLocale();
  const translation = useLiveTranslation({ publicAccess: true });
  const { login, loginWithPasskey, signOutNotice, sessionError } = useAuth();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [automaticPasskey] = useState(shouldStartPasskeyLogin);
  const [passkeyFailed, setPasskeyFailed] = useState(false);
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
      pauseAutomaticPasskeyLogin();
      setPasskeyFailed(true);
      setError(passkeyError(err));
    } finally {
      setPasskeyBusy(false);
    }
  }, [loginWithPasskey, navigate, target]);

  useEffect(() => {
    if (!automaticPasskey || !passkeysSupported() || autoPasskeyStarted.current)
      return;
    autoPasskeyStarted.current = true;
    void onPasskeyLogin();
  }, [automaticPasskey, onPasskeyLogin]);

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? translate('E-mail ou senha inválidos.')
          : errorMessage(err),
      );
    }
  });

  return (
    <AuthCard
      title={translate('Acesse sua conta')}
      subtitle={translate('Entre para continuar na plataforma da igreja.')}
      notice={state.notice ?? signOutNotice ?? undefined}
      error={error ?? sessionError}
      footer={
        <>
          <Link component={RouterLink} to="/forgot-password">
            {translate('Esqueci minha senha')}
          </Link>
          <Link component={RouterLink} to="/register">
            {translate('Criar uma conta')}
          </Link>
        </>
      }
    >
      {translation.active && (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Alert severity="info">
            {translate(
              'Tradução ao vivo disponível, sem precisar de conta. É preciso estar conectado ao Wi-Fi da igreja para ouvir e acompanhar o texto.',
            )}
          </Alert>
          <Button
            component={RouterLink}
            to="/listen-translation"
            variant="outlined"
            size="large"
            startIcon={<TranslateRounded />}
            fullWidth
          >
            {translate('Ouvir tradução ao vivo — sem entrar')}
          </Button>
        </Stack>
      )}
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <TextField
            label={translate('E-mail')}
            type="email"
            autoComplete="username"
            fullWidth
            error={Boolean(formState.errors.email)}
            helperText={translate(formState.errors.email?.message ?? '')}
            {...register('email')}
          />
          <TextField
            label={translate('Senha')}
            type="password"
            autoComplete="current-password"
            fullWidth
            error={Boolean(formState.errors.password)}
            helperText={translate(formState.errors.password?.message ?? '')}
            {...register('password')}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={formState.isSubmitting || passkeyBusy}
          >
            {translate('Entrar')}
          </Button>
          {passkeysSupported() && (!automaticPasskey || passkeyFailed) && (
            <Button
              variant="outlined"
              size="large"
              disabled={formState.isSubmitting || passkeyBusy}
              onClick={onPasskeyLogin}
            >
              {passkeyBusy
                ? translate('A confirmar…')
                : translate('Entrar com biometria ou passkey')}
            </Button>
          )}
        </Stack>
      </Box>
    </AuthCard>
  );
}
