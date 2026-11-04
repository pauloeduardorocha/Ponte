import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Avatar,
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
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/auth-context';
import { PageHeader } from '../components/PageParts';
import { compressAvatar } from '../lib/avatar';
import { changePassword } from '../lib/auth-api';
import { errorMessage } from '../lib/errors';
import { passwordSchema } from '../lib/validation';
import { PasskeySettings } from '../components/PasskeySettings';
import { MemberFamily } from '../components/MemberFamily';

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
  const {
    user,
    clearSession,
    updateColorMode,
    updatePushPreference,
    updateAvatar,
  } = useAuth();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSaved, setAvatarSaved] = useState(false);
  async function saveAvatar(file: File | null) {
    setSavingAvatar(true);
    setAvatarError(null);
    setAvatarSaved(false);
    try {
      await updateAvatar(file ? await compressAvatar(file) : null);
      setAvatarSaved(true);
    } catch (err) {
      setAvatarError(errorMessage(err));
    } finally {
      setSavingAvatar(false);
    }
  }
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [pushPreferenceSaving, setPushPreferenceSaving] = useState(false);
  const [pushPreferenceError, setPushPreferenceError] = useState<string | null>(
    null,
  );
  const [pushPreferenceSaved, setPushPreferenceSaved] = useState(false);

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
  async function changePushPreference(
    key:
      | 'pushReimbursementRequested'
      | 'pushEventRefundRequested'
      | 'pushLibraryOverdue'
      | 'pushLibraryReservationReady'
      | 'pushBirthdays',
    value: boolean,
  ) {
    setPushPreferenceSaving(true);
    setPushPreferenceError(null);
    setPushPreferenceSaved(false);
    try {
      await updatePushPreference(key, value);
      setPushPreferenceSaved(true);
    } catch (err) {
      setPushPreferenceError(errorMessage(err));
    } finally {
      setPushPreferenceSaving(false);
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
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                flexWrap="wrap"
              >
                <Avatar
                  src={user?.avatar ?? undefined}
                  alt={user?.name}
                  sx={{ width: 72, height: 72 }}
                >
                  {user?.name?.charAt(0)}
                </Avatar>
                <Button component="label" disabled={savingAvatar}>
                  Alterar foto
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Selecionar foto"
                    disabled={savingAvatar}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void saveAvatar(file);
                    }}
                  />
                </Button>
                {user?.avatar && (
                  <Button
                    disabled={savingAvatar}
                    onClick={() => void saveAvatar(null)}
                  >
                    Remover foto
                  </Button>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                JPEG, PNG ou WebP. A foto é comprimida para até 0,5 MB antes do
                envio.
              </Typography>
              {savingAvatar && (
                <Typography role="status">Salvando foto…</Typography>
              )}
              {avatarError && <Alert severity="error">{avatarError}</Alert>}
              {avatarSaved && (
                <Alert severity="success">Foto atualizada.</Alert>
              )}
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
                  label={
                    user?.status === 'PENDING_APPROVAL'
                      ? 'Aguardando aprovação'
                      : user?.status === 'ACTIVE'
                        ? 'Ativa'
                        : 'Desativada'
                  }
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
      {user?.status === 'ACTIVE' && user.memberId && <MemberFamily />}
      {user?.status !== 'PENDING_APPROVAL' && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>
                Notificações push
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Escolha quais avisos do sistema quer receber nos dispositivos
                com notificações ativadas.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={user?.pushReimbursementRequested ?? true}
                    disabled={pushPreferenceSaving}
                    onChange={(_, checked) =>
                      void changePushPreference(
                        'pushReimbursementRequested',
                        checked,
                      )
                    }
                  />
                }
                label="Novos pedidos na fila financeira de reembolsos"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={user?.pushEventRefundRequested ?? true}
                    disabled={pushPreferenceSaving}
                    onChange={(_, checked) =>
                      void changePushPreference(
                        'pushEventRefundRequested',
                        checked,
                      )
                    }
                  />
                }
                label="Pedidos de reembolso de inscrições em eventos"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={user?.pushLibraryOverdue ?? true}
                    disabled={pushPreferenceSaving}
                    onChange={(_, checked) =>
                      void changePushPreference('pushLibraryOverdue', checked)
                    }
                  />
                }
                label="Empréstimos de livros em atraso"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={user?.pushLibraryReservationReady ?? true}
                    disabled={pushPreferenceSaving}
                    onChange={(_, checked) =>
                      void changePushPreference(
                        'pushLibraryReservationReady',
                        checked,
                      )
                    }
                  />
                }
                label="Exemplares disponíveis para as minhas reservas"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={user?.pushBirthdays ?? true}
                    disabled={pushPreferenceSaving}
                    onChange={(_, checked) =>
                      void changePushPreference('pushBirthdays', checked)
                    }
                  />
                }
                label="Aniversariantes do dia"
              />
              {pushPreferenceSaving && (
                <Typography role="status">Salvando preferência…</Typography>
              )}
              {pushPreferenceSaved && (
                <Alert severity="success">
                  Preferência de notificações salva.
                </Alert>
              )}
              {pushPreferenceError && (
                <Alert severity="error">{pushPreferenceError}</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
