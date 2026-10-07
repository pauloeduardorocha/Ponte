import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { resetPassword } from '../lib/auth-api';
import { errorMessage } from '../lib/errors';
import { passwordSchema } from '../lib/validation';

const resetSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

type ResetFields = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ResetFields>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setError(null);
    try {
      await resetPassword({ token, newPassword });
      navigate('/login', {
        replace: true,
        state: { notice: 'Senha redefinida. Entre com a nova senha.' },
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Redefinir senha"
      subtitle="Escolha uma nova senha para sua conta."
      error={error}
      footer={
        <Link component={RouterLink} to="/login">
          Voltar para o login
        </Link>
      }
    >
      {token ? (
        <Box component="form" onSubmit={onSubmit} noValidate>
          <Stack spacing={2}>
            <TextField
              label="Nova senha"
              type="password"
              autoComplete="new-password"
              fullWidth
              error={Boolean(formState.errors.newPassword)}
              helperText={formState.errors.newPassword?.message}
              {...register('newPassword')}
            />
            <TextField
              label="Confirmar nova senha"
              type="password"
              autoComplete="new-password"
              fullWidth
              error={Boolean(formState.errors.confirmPassword)}
              helperText={formState.errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={formState.isSubmitting}
            >
              Redefinir senha
            </Button>
          </Stack>
        </Box>
      ) : (
        <Alert severity="warning">
          Link de redefinição inválido. Solicite um novo link.
        </Alert>
      )}
    </AuthCard>
  );
}
