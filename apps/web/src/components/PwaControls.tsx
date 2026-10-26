import { useEffect, useRef, useState } from 'react';
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
import { applyPwaUpdate } from '../lib/pwa-update';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISSED_KEY = 'ponte:pwa-install-dismissed';

interface RelatedApp {
  platform: string;
  url?: string;
  id?: string;
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [instructions, setInstructions] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const updateInProgress = useRef(false);
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
  } = useRegisterSW({
    // Reloading is handled after explicit acceptance, including cross-tab updates.
    onNeedReload: () => undefined,
  });

  async function update() {
    if (updateInProgress.current) return;
    updateInProgress.current = true;
    setUpdating(true);
    setUpdateError(null);
    try {
      await applyPwaUpdate();
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar. Tente novamente.',
      );
    } finally {
      updateInProgress.current = false;
      setUpdating(false);
    }
  }

  useEffect(() => {
    let active = true;
    const relatedNavigator = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
    };
    async function detectInstallation() {
      try {
        const apps = await relatedNavigator.getInstalledRelatedApps?.();
        const manifestUrl = new URL(
          '/manifest.webmanifest',
          window.location.origin,
        ).href;
        if (
          active &&
          apps?.some(
            (app) => app.platform === 'webapp' && app.url === manifestUrl,
          )
        ) {
          setInstalled(true);
          setInstallPrompt(null);
        }
      } catch {
        // Unsupported or denied detection must not prevent manual installation.
      }
    }
    void detectInstallation();
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
      active = false;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismissInstallation() {
    setInstallDismissed(true);
    setInstructions(false);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    } catch {
      // Keep the dismissal for this session when storage is unavailable.
    }
  }

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
      {!installed && !installDismissed && (installPrompt || ios) && (
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
          <Button onClick={dismissInstallation}>
            Já instalei / Não mostrar novamente
          </Button>
          <Button onClick={() => setInstructions(false)}>Entendido</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={needRefresh}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={updateError ? 'error' : 'info'}
          onClose={updating ? undefined : () => setNeedRefresh(false)}
          action={
            <Button
              color="inherit"
              disabled={updating}
              onClick={() => void update()}
            >
              {updating
                ? 'A atualizar…'
                : updateError
                  ? 'Tentar novamente'
                  : 'Atualizar'}
            </Button>
          }
        >
          {updateError ??
            (updating
              ? 'A aplicar a nova versão…'
              : 'Nova versão disponível. Guarde as alterações antes de atualizar.')}
        </Alert>
      </Snackbar>
    </>
  );
}
