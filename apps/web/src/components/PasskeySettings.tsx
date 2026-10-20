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

export function PasskeySettings() {
  const client = useQueryClient();
  const keys = useQuery({ queryKey: ['passkeys'], queryFn: listPasskeys });
  const [password, setPassword] = useState('');
  const [name, setName] = useState('O meu dispositivo');
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
            Biometria e passkeys
          </Typography>
          <Typography variant="body2">
            Entre com a impressão digital, reconhecimento facial ou PIN do
            dispositivo, também no PWA. Os dados biométricos ficam no
            dispositivo. Mantenha a senha para recuperar o acesso.
          </Typography>
          {notice && <Alert severity="success">{notice}</Alert>}
          {(error || keys.error) && (
            <Alert severity="error">{error ?? passkeyError(keys.error)}</Alert>
          )}
          {keys.isPending && <Typography>A carregar passkeys…</Typography>}
          {keys.data?.length === 0 && (
            <Typography>Nenhuma passkey registada.</Typography>
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
                aria-label={`Remover ${key.name}`}
                onClick={() =>
                  void perform(
                    () => removePasskey(key.id),
                    'Passkey removida. Este método já não permite novos acessos.',
                  )
                }
              >
                Remover
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
                  void perform(
                    () => registerPasskey(password, name.trim()),
                    'Passkey ativada. Já pode utilizá-la no próximo acesso.',
                  );
              }}
            >
              <TextField
                label="Nome do dispositivo"
                value={name}
                onChange={(event) => setName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 80 } }}
                required
                disabled={busy}
              />
              <TextField
                label="Senha atual para ativar"
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
                {busy ? 'A confirmar…' : 'Ativar biometria / criar passkey'}
              </Button>
            </Stack>
          ) : (
            <Alert severity="info">
              Este navegador não disponibiliza passkeys. Utilize um navegador
              atualizado com HTTPS.
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
