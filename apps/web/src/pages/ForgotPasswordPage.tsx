import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Button, Link, Stack, TextField } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { forgotPassword } from '../lib/auth-api';
import { errorMessage } from '../lib/errors';
import { emailSchema } from '../lib/validation';

const forgotSchema = z.object({ email: emailSchema });
type ForgotFields = z.infer<typeof forgotSchema>;

const DEFAULT_NOTICE =
  'Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.';

export function ForgotPasswordPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotFields>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    setNotice(null);
    try {
      const response = await forgotPassword(email);
      setNotice(response?.message ?? DEFAULT_NOTICE);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber o link de redefinição."
      notice={notice}
      error={error}
      footer={
        <Link component={RouterLink} to="/login">
          Voltar para o login
        </Link>
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
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={formState.isSubmitting}
          >
            Enviar instruções
          </Button>
        </Stack>
      </Box>
    </AuthCard>
  );
}
