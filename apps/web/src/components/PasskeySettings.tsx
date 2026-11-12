import { t as translate, useLocale } from '../i18n';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  listPasskeys,
  passkeyError,
  passkeysSupported,
  registerPasskey,
  removePasskey,
} from '../lib/passkeys';
import { useAuth } from '../auth/auth-context';
import { forgetPasskey, rememberPasskey } from '../lib/passkey-preferences';

export function PasskeySettings() {
  useLocale();
  const { user } = useAuth();
  const client = useQueryClient();
  const keys = useQuery({ queryKey: ['passkeys'], queryFn: listPasskeys });
  const [password, setPassword] = useState('');
  const [name, setName] = useState(translate('O meu dispositivo'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const supported = passkeysSupported();
  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await client.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (err) {
      setError(passkeyError(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700}>
            {translate('Biometria e passkeys')}
          </Typography>
          <Typography variant="body2">
            {translate(
              'Entre com a impressão digital, reconhecimento facial ou PIN do dispositivo, também no PWA. Os dados biométricos ficam no dispositivo. Mantenha a senha para recuperar o acesso.',
            )}
          </Typography>
          {notice && (
            <Alert severity="success">{translate(notice ?? '')}</Alert>
          )}
          {(error || keys.error) && (
            <Alert severity="error">{error ?? passkeyError(keys.error)}</Alert>
          )}
          {keys.isPending && (
            <Typography>{translate('A carregar passkeys…')}</Typography>
          )}
          {keys.data?.length === 0 && (
            <Typography>{translate('Nenhuma passkey registada.')}</Typography>
          )}
          {keys.data?.map((key) => (
            <Stack
              key={key.id}
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography>{key.name}</Typography>
              <Button
                color="error"
                disabled={busy}
                aria-label={translate('Remover {0}', [key.name])}
                onClick={() =>
                  void perform(async () => {
                    await removePasskey(key.id);
                    if (user) forgetPasskey(user.id, key.id);
                  }, translate('Passkey removida. Este método já não permite novos acessos.'))
                }
              >
                {translate('Remover')}
              </Button>
            </Stack>
          ))}
          {supported ? (
            <Stack
              component="form"
              spacing={2}
              onSubmit={(event) => {
                event.preventDefault();
                if (password && name.trim())
                  void perform(async () => {
                    const id = await registerPasskey(password, name.trim());
                    if (user) rememberPasskey(user.id, id);
                  }, translate('Passkey ativada. Já pode utilizá-la no próximo acesso.'));
              }}
            >
              <TextField
                label={translate('Nome do dispositivo')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 80 } }}
                required
                disabled={busy}
              />
              <TextField
                label={translate('Senha atual para ativar')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Button
                type="submit"
                variant="outlined"
                disabled={
                  busy ||
                  !password ||
                  !name.trim() ||
                  keys.isPending ||
                  keys.isError
                }
              >
                {busy
                  ? translate('A confirmar…')
                  : translate('Ativar biometria / criar passkey')}
              </Button>
            </Stack>
          ) : (
            <Alert severity="info">
              {translate(
                'Este navegador não disponibiliza passkeys. Utilize um navegador atualizado com HTTPS.',
              )}
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
