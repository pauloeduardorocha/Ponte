import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Button, Link, Stack, TextField } from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { AuthCard } from '../components/AuthCard';
import { ApiError } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { emailSchema } from '../lib/validation';

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
  const { login, signOutNotice, sessionError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      const target = state.from
        ? `${state.from.pathname}${state.from.search ?? ''}`
        : '/';
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
            disabled={formState.isSubmitting}
          >
            Entrar
          </Button>
        </Stack>
      </Box>
    </AuthCard>
  );
}
