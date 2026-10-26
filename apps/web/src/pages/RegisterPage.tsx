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
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^\+?[\d ()-]+$/, 'Informe um telefone válido.')
      .regex(/^(?:\D*\d){7,15}\D*$/, 'Informe entre 7 e 15 dígitos.'),
    birthDate: z.iso
      .date('Informe uma data válida.')
      .refine(
        (value) => value <= new Date().toISOString().slice(0, 10),
        'A data não pode estar no futuro.',
      ),
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
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      birthDate: '',
    },
  });

  const onSubmit = handleSubmit(
    async ({ name, email, password, phone, birthDate }) => {
      setError(null);
      try {
        await registerAccount({ name, email, password, phone, birthDate });
        navigate('/login', {
          replace: true,
          state: {
            notice:
              'Conta criada. Entre para assistir aos vídeos e ver os aniversariantes enquanto aguarda aprovação.',
          },
        });
      } catch (err) {
        setError(errorMessage(err));
      }
    },
  );

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Seu cadastro será avaliado por um administrador ou pastor."
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
            label="Telefone"
            type="tel"
            autoComplete="tel"
            required
            fullWidth
            error={Boolean(formState.errors.phone)}
            helperText={formState.errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Data de nascimento"
            type="date"
            autoComplete="bday"
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={Boolean(formState.errors.birthDate)}
            helperText={formState.errors.birthDate?.message}
            {...register('birthDate')}
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
