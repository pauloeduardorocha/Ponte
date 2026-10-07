import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Button, Link, Stack, TextField } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { register as registerAccount } from '../lib/auth-api';
import { errorMessage } from '../lib/errors';
import { emailSchema, nameSchema, passwordSchema } from '../lib/validation';

const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

type RegisterFields = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RegisterFields>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setError(null);
    try {
      await registerAccount({ name, email, password });
      navigate('/login', {
        replace: true,
        state: { notice: 'Conta criada com sucesso. Entre com seus dados.' },
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Cadastre-se para acessar a plataforma da igreja."
      error={error}
      footer={
        <Link component={RouterLink} to="/login">
          Já tenho uma conta
        </Link>
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <TextField
            label="Nome"
            autoComplete="name"
            fullWidth
            error={Boolean(formState.errors.name)}
            helperText={formState.errors.name?.message}
            {...register('name')}
          />
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
            autoComplete="new-password"
            fullWidth
            error={Boolean(formState.errors.password)}
            helperText={formState.errors.password?.message}
            {...register('password')}
          />
          <TextField
            label="Confirmar senha"
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
            Criar conta
          </Button>
        </Stack>
      </Box>
    </AuthCard>
  );
}
