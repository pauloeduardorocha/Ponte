import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import {
  passkeyError,
  platformPasskeysSupported,
  registerPasskey,
} from '../lib/passkeys';
import { postponePasskey, rememberPasskey } from '../lib/passkey-preferences';

interface Props {
  userId: string;
  password: string;
  onClose: () => void;
}

export function PasskeyEnrollment({ userId, password, onClose }: Props) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();

  useEffect(() => {
    let active = true;
    void platformPasskeysSupported().then((supported) => {
      if (!active) return;
      if (supported) setAvailable(true);
      else onClose();
    });
    // Keep the password only in memory, briefly, to reuse server reauthentication.
    const expiry = window.setTimeout(onClose, 5 * 60_000);
    return () => {
      active = false;
      window.clearTimeout(expiry);
    };
  }, [onClose]);

  function dismiss() {
    if (busy) return;
    postponePasskey(userId);
    onClose();
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const id = await registerPasskey(password, 'Este dispositivo', true);
      rememberPasskey(userId, id);
      await client.invalidateQueries({ queryKey: ['passkeys'] });
      onClose();
    } catch (err) {
      setError(passkeyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={available}
      onClose={dismiss}
      aria-labelledby="passkey-enrollment-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="passkey-enrollment-title">
        Entrar mais rápido neste dispositivo?
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Ative uma passkey para entrar com o rosto, impressão digital ou PIN do
          dispositivo. Nos próximos acessos, vamos oferecer essa opção
          automaticamente. O PIN e os dados biométricos ficam no dispositivo.
          Ative apenas num dispositivo pessoal.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions
        sx={{
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          '& > :not(style) ~ :not(style)': { ml: { xs: 0, sm: 1 } },
        }}
      >
        <Button disabled={busy} onClick={dismiss}>
          Agora não
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void activate()}
        >
          {busy ? 'A confirmar…' : 'Ativar neste dispositivo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
