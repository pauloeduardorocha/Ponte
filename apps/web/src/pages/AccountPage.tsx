import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { PageHeader } from '../components/PageParts';
import { changePassword } from '../lib/auth-api';
import { errorMessage } from '../lib/errors';
import { passwordSchema } from '../lib/validation';
import { PasskeySettings } from '../components/PasskeySettings';

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

type PasswordFields = z.infer<typeof passwordFormSchema>;

export function AccountPage() {
  const { user, clearSession, updateColorMode } = useAuth();
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [appearanceSaved, setAppearanceSaved] = useState(false);

  async function changeAppearance(mode: 'system' | 'light' | 'dark') {
    setSavingAppearance(true);
    setAppearanceError(null);
    setAppearanceSaved(false);
    try {
      await updateColorMode(mode);
      setAppearanceSaved(true);
    } catch (err) {
      setAppearanceError(errorMessage(err));
    } finally {
      setSavingAppearance(false);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<PasswordFields>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      // The API revokes every session after a password change; the auth guard
      // then redirects to login showing this notice.
      clearSession('Senha alterada. Entre novamente com a nova senha.');
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Minha conta"
        subtitle="Consulte seus dados, personalize a aparência e altere sua senha."
      />
      <Box className="account-grid">
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={700}>
                Dados da conta
              </Typography>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Nome
                </Typography>
                <Typography>{user?.name}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  E-mail
                </Typography>
                <Typography>{user?.email}</Typography>
              </Box>
              <Box>
                <Chip
                  size="small"
                  color={user?.status === 'ACTIVE' ? 'success' : 'default'}
                  label={user?.status === 'ACTIVE' ? 'Ativa' : 'Desativada'}
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Box component="form" onSubmit={onSubmit} noValidate>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={700}>
                  Alterar senha
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ao alterar a senha, todas as sessões serão encerradas.
                </Typography>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  label="Senha atual"
                  type="password"
                  autoComplete="current-password"
                  error={Boolean(formState.errors.currentPassword)}
                  helperText={formState.errors.currentPassword?.message}
                  {...register('currentPassword')}
                />
                <TextField
                  label="Nova senha"
                  type="password"
                  autoComplete="new-password"
                  error={Boolean(formState.errors.newPassword)}
                  helperText={formState.errors.newPassword?.message}
                  {...register('newPassword')}
                />
                <TextField
                  label="Confirmar nova senha"
                  type="password"
                  autoComplete="new-password"
                  error={Boolean(formState.errors.confirmPassword)}
                  helperText={formState.errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
                <Box>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={formState.isSubmitting}
                  >
                    Alterar senha
                  </Button>
                </Box>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Box>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={700}>
              Aparência
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Escolha o modo de cores da sua conta. Por padrão, a aparência
              segue o dispositivo. Sua preferência é salva automaticamente e
              usada nos seus dispositivos.
            </Typography>
            <FormControl disabled={savingAppearance}>
              <FormLabel id="color-mode-label">Modo de cores</FormLabel>
              <RadioGroup
                row
                aria-labelledby="color-mode-label"
                value={user?.colorMode ?? 'system'}
                onChange={(_, value) => {
                  if (
                    value === 'system' ||
                    value === 'light' ||
                    value === 'dark'
                  )
                    void changeAppearance(value);
                }}
              >
                <FormControlLabel
                  value="system"
                  control={<Radio />}
                  label="Seguir o dispositivo"
                />
                <FormControlLabel
                  value="light"
                  control={<Radio />}
                  label="Claro"
                />
                <FormControlLabel
                  value="dark"
                  control={<Radio />}
                  label="Escuro"
                />
              </RadioGroup>
            </FormControl>
            {savingAppearance && (
              <Typography role="status">Salvando preferência…</Typography>
            )}
            {appearanceSaved && (
              <Alert severity="success">Preferência de aparência salva.</Alert>
            )}
            {appearanceError && (
              <Alert severity="error">{appearanceError}</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
      <PasskeySettings />
    </Stack>
  );
}
