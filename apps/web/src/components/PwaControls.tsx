import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
} from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [instructions, setInstructions] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setInstructions(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  return (
    <>
      {!installed && (installPrompt || ios) && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            right: 16,
            zIndex: 1200,
          }}
        >
          <Button variant="contained" onClick={() => void install()}>
            Instalar aplicação
          </Button>
        </Box>
      )}
      <Dialog open={instructions} onClose={() => setInstructions(false)}>
        <DialogTitle>Instalar no iPhone ou iPad</DialogTitle>
        <DialogContent>
          Abra esta página no Safari, toque em Partilhar e escolha “Adicionar ao
          ecrã principal”. Se aparecer a opção “Abrir como aplicação”,
          mantenha-a ativada e toque em Adicionar.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInstructions(false)}>Entendido</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={needRefresh}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          onClose={() => setNeedRefresh(false)}
          action={
            <Button
              color="inherit"
              onClick={() => void updateServiceWorker(true)}
            >
              Atualizar
            </Button>
          }
        >
          Nova versão disponível. Guarde as alterações antes de atualizar.
        </Alert>
      </Snackbar>
    </>
  );
}
